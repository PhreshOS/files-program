import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { context, system } from "@phreshos/server"
import type { EndpointMetadata } from "@phreshos/core"
import { z } from "zod"
import { pickerView } from "./launches"

/**
 * The "file-picker-v1" Service: a Program asks a person to choose a file to open, or a place to save
 * one, or to let it reach a path it names, and receives what they chose. Files never chooses for it:
 * a small Files window shows the person who asks and what for, and the answer comes once they choose,
 * or nothing if they cancel or close it. How long to wait is the asker's to decide, by the time it
 * gives its question.
 *
 * What the person chooses is also what the asking Process may then read or write through this
 * Service, for as long as it runs: a finer way to the files than the System's `storage` permission,
 * given one file or folder at a time, by the person's own choice.
 */

const program = await context.program()

/** A place on the Desktop's plane: pixels, or a share of the view such as "50% - 200". */
const value = z.union([z.number(), z.string().min(1).max(100)])
const position = z.object({ x: value, y: value }).optional()
const types = z.array(z.string().regex(/^[\w.+-]+\/(\*|[\w.+-]+)$/)).max(100).optional()

const contract = {
    // One file, or several, of the given types; any file when none are given. Each starts browsing in
    // the folder given, or the home folder.
    open: z.object({ types, multiple: z.boolean().default(false), folder: z.string().startsWith("/").max(4096).optional(), position }),
    // A place and a name for a new file, starting from a suggested name.
    save: z.object({ name: z.string().min(1).max(255).optional(), type: z.string().max(200).optional(), folder: z.string().startsWith("/").max(4096).optional(), position }),
    // A path the asker names, to read, or to read and write.
    access: z.object({ path: z.string().startsWith("/").max(4096), mode: z.enum(["read", "write"]), position }),
    read: z.object({ path: z.string().startsWith("/").max(4096) }),
    write: z.object({ path: z.string().startsWith("/").max(4096), content: z.union([z.string(), z.instanceof(Uint8Array)]) }),
    request: z.object({ request: z.string().uuid() }),
    choose: z.object({ request: z.string().uuid(), paths: z.array(z.string().startsWith("/")).min(1).max(10_000) })
}

/** Who asks, as the person sees it in the window. */
type Asker = Readonly<{ program: string, name: string }>

/** What a picker window shows, and asks the person for. */
export type PickerRequest = Readonly<{ request: string, asker: Asker | null }> & (
    | Readonly<{ kind: "open", types: readonly string[], multiple: boolean, folder: string | null }>
    | Readonly<{ kind: "save", name: string | null, type: string | null, folder: string | null }>
    | Readonly<{ kind: "access", path: string, mode: Mode }>
)

/** Reading, or reading and writing. */
type Mode = "read" | "write"

/**
 * What the person let each asking Process reach, by its identity: a file, or a folder and everything
 * inside it, each to read or to write. A caller that is no Process, such as a script, holds nothing
 * between its questions. Identities are never reused, so a grant outliving its Process lets no one in.
 */
const grants = new Map<string, Map<string, Mode>>()

async function grant(asker: EndpointMetadata | null, paths: readonly string[], mode: Mode) {
    if (!asker) return
    let held = grants.get(asker.process)
    if (!held) {
        held = new Map()
        grants.set(asker.process, held)
        // Let go once the Process ends, when Files may see it end; otherwise the grant stays, unusable.
        const process = await system.process.find(asker.process).catch(() => null)
        process?.subscribe("exit", () => { grants.delete(asker.process) })
    }
    for (const path of paths) if (held.get(path) !== "write") held.set(path, mode)
}

/** Refuses a path the person has not let this Process reach, in this way. */
function require(asker: EndpointMetadata | null, path: string, mode: Mode) {
    const held = asker ? grants.get(asker.process) : undefined
    const reaches = held && [...held].some(([granted, given]) =>
        (path === granted || path.startsWith(granted.endsWith("/") ? granted : `${granted}/`)) && (mode === "read" || given === "write"))
    if (!reaches) throw new Error(`The person has not let this Program ${mode} ${path}`)
}

type Pending = { readonly snapshot: PickerRequest, window: string | null, readonly settle: (paths: readonly string[] | null) => void, expiry?: ReturnType<typeof setTimeout> }

/**
 * How long a request waits for the person at most, whatever its asker allows: once this passes, the
 * picker answers with nothing and closes its window. An asker that stops waiting sooner closes it then.
 */
const requestLifetime = 10 * 60_000

/** The requests whose person has not chosen yet, by their identity. */
const pending = new Map<string, Pending>()

/** The Program that asks, as every message tells it; `null` for a script acting for the owner. */
function askerOf(from: EndpointMetadata | null): Asker | null {
    return from && { program: from.program.identity, name: from.program.name }
}

/** Opens a picker window for one request, and waits for the person. */
async function ask(from: EndpointMetadata | null, signal: AbortSignal, request: (identity: string, asker: Asker | null) => PickerRequest, at: z.infer<typeof position>) {
    const identity = randomUUID()
    const snapshot = request(identity, askerOf(from))
    const title = snapshot.kind === "open" ? "Open" : snapshot.kind === "save" ? "Save" : "Allow access"
    return await new Promise<readonly string[] | null>((resolve, reject) => {
        // Known before its window opens, which reads it as soon as it starts.
        const request: Pending = { snapshot, window: null, settle: resolve }
        pending.set(identity, request)
        request.expiry = setTimeout(() => { if (pending.has(identity)) settle(identity, null) }, requestLifetime)
        // The asker stopped waiting: its window closes at once, with nothing chosen.
        signal.addEventListener("abort", () => { if (pending.has(identity)) settle(identity, null) }, { once: true })
        program.createProcess({
            server: false,
            client: { title, size: snapshot.kind === "access" ? { width: 460, height: 240 } : { width: 720, height: 460 }, ...(at ? { position: at } : {}) },
            options: { view: pickerView, request: identity }
        }).then(window => { request.window = window.identity }, error => {
            clearTimeout(request.expiry)
            pending.delete(identity)
            reject(error)
        })
    })
}

/** Only Files' own windows answer for a person; no other Program may choose in their place. */
function fromFilesWindow(from: EndpointMetadata | null) {
    if (from?.program.identity !== program.identity || from.endpoint !== "client") throw new Error("Only a Files window answers a picker request")
}

/** Ends one request with what the person chose, or nothing, and closes its window. */
function settle(identity: string, paths: readonly string[] | null) {
    const request = pending.get(identity)
    if (!request) throw new Error("This request was already answered")
    pending.delete(identity)
    clearTimeout(request.expiry)
    request.settle(paths)
    if (request.window) void program.findProcess(request.window).then(window => window?.exit()).catch(() => undefined)
}

// A window closed before the person chose: they chose nothing.
program.subscribe("processExit", ({ process }) => {
    for (const [identity, request] of pending) if (request.window === process.identity) {
        pending.delete(identity)
        clearTimeout(request.expiry)
        request.settle(null)
    }
})

// The files chosen to open, which the asker may then read.
context.answer("open", async ({ from, payload, signal }) => {
    const { types, multiple, folder, position: at } = contract.open.parse(payload ?? {})
    const paths = await ask(from, signal, (request, asker) => ({ request, asker, kind: "open", types: types ?? [], multiple, folder: folder ?? null }), at)
    if (paths) await grant(from, paths, "read")
    return paths && { paths }
})

// The place chosen to save in, which the asker may then read and write.
context.answer("save", async ({ from, payload, signal }) => {
    const { name, type, folder, position: at } = contract.save.parse(payload ?? {})
    const paths = await ask(from, signal, (request, asker) => ({ request, asker, kind: "save", name: name ?? null, type: type ?? null, folder: folder ?? null }), at)
    if (paths) await grant(from, paths, "write")
    return paths && { path: paths[0]! }
})

// A path the asker names itself, which the person lets it read, or read and write.
context.answer("access", async ({ from, payload, signal }) => {
    const { path, mode, position: at } = contract.access.parse(payload)
    const allowed = await ask(from, signal, (request, asker) => ({ request, asker, kind: "access", path, mode }), at)
    if (allowed) await grant(from, [path], mode)
    return allowed && { path }
})

// What the person let the asking Process reach, read and written through this Service.
context.answer("read", async ({ from, payload }) => {
    const { path } = contract.read.parse(payload)
    require(from, path, "read")
    return new Uint8Array(await readFile(path))
})

context.answer("write", async ({ from, payload }) => {
    const { path, content } = contract.write.parse(payload)
    require(from, path, "write")
    await writeFile(path, content)
})

// What a picker window reads first: the request it was opened for.
context.answer("picker.request", async ({ from, payload }) => {
    fromFilesWindow(from)
    const request = pending.get(contract.request.parse(payload).request)
    if (!request) throw new Error("This request was already answered")
    return request.snapshot
})

context.answer("picker.choose", async ({ from, payload }) => {
    fromFilesWindow(from)
    const { request, paths } = contract.choose.parse(payload)
    settle(request, paths)
})

context.answer("picker.cancel", async ({ from, payload }) => {
    fromFilesWindow(from)
    settle(contract.request.parse(payload).request, null)
})
