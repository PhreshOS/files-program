import { context } from "@phreshos/client"
import type { Process, ServerEndpoint } from "@phreshos/core"
import type { FolderEntry } from "../server/folders"
import { kindOf, type Entry } from "./entries"

export type FileContent = Readonly<{ bytes: Uint8Array, size: number, modified: number }>

type Shared = Readonly<{ process: Process, server: ServerEndpoint }>
let shared: Promise<Shared> | undefined

/**
 * The one Files Server every window uses. The first window to need it starts it; the others, a
 * second Files window or a file's own window, find it running.
 */
function server() {
    shared ??= (async () => {
        const program = await context.program()
        const process = await program.findOrCreateProcess({ name: "server", server: true, client: false })
        await process.server.waitReady()
        return { process, server: process.server }
    })().catch(error => { shared = undefined; throw error })
    return shared
}

/**
 * Asks the Files Server. When its Process has ended since this window found it, the window finds or
 * starts it again and asks once more.
 */
async function ask<Result>(event: string, payload?: unknown, timeout = 10_000): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
        const current = await server()
        try {
            return await current.server.timeout(timeout).ask<Result>(event, payload)
        }
        catch (error) {
            const ended = await current.process.exited().catch(() => true)
            if (attempt > 0 || !ended) throw error
            shared = undefined
        }
    }
}

function entryOf(entry: FolderEntry): Entry {
    return entry.type === "folder"
        ? { path: entry.path, name: entry.name, kind: "folder", modified: entry.modified }
        : { path: entry.path, name: entry.name, kind: kindOf(entry.name), size: entry.size, modified: entry.modified }
}

/** The home folder of the user running PhreshOS. */
export function homePath() {
    return ask<string>("home")
}

/** The entries directly inside one folder. */
export async function listFolder(path: string): Promise<Entry[]> {
    return (await ask<FolderEntry[]>("folder.list", { path })).map(entryOf)
}

/** One entry by its path. */
export async function entryAt(path: string): Promise<Entry> {
    return entryOf(await ask<FolderEntry>("entry.get", { path }))
}

/** Which of these folders exist on the machine. */
export function existing(paths: readonly string[]) {
    return ask<string[]>("folders.existing", { paths })
}

/** How much of a file one answer carries. */
const piece = 4 * 1024 * 1024

/** A file's bytes, or its first `length` bytes, read piece by piece. */
export async function readFile(path: string, length = Number.POSITIVE_INFINITY): Promise<FileContent> {
    const first = await ask<FileContent>("file.read", { path, offset: 0, length: Math.min(length, piece) }, 60_000)
    const total = Math.min(length, first.size)
    if (first.bytes.length >= total) return first
    const bytes = new Uint8Array(total)
    bytes.set(first.bytes)
    let read = first.bytes.length
    while (read < total) {
        const next = await ask<FileContent>("file.read", { path, offset: read, length: Math.min(piece, total - read) }, 60_000)
        if (!next.bytes.length) break
        bytes.set(next.bytes, read)
        read += next.bytes.length
    }
    return { bytes: bytes.subarray(0, read), size: first.size, modified: first.modified }
}
