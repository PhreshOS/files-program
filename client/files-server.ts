import { context } from "@phreshos/client"
import type { Process, ServerEndpoint } from "@phreshos/core"
import type { Clipboard } from "../server/clipboard"
import type { FolderEntry } from "../server/folders"
import type { Task } from "../server/tasks"
import { kindOf, type Entry } from "./entries"

/**
 * The one Files Server, as a window reaches it: its questions, and what it announces to every
 * window.
 */

type FileContent = Readonly<{ bytes: Uint8Array, size: number, modified: number }>

type Shared = Readonly<{ process: Process, server: ServerEndpoint }>
let shared: Promise<Shared> | undefined

/** Who follows what the Server announces: a folder that changed, the clipboard, and the tasks. */
const followers = {
    folder: new Set<(path: string) => void>(),
    clipboard: new Set<(clipboard: Clipboard) => void>(),
    tasks: new Set<(tasks: readonly Task[]) => void>()
}

/**
 * The one Files Server every window uses. The first window to need it starts it; the others, a
 * second Files window or a file's own window, find it running.
 */
function server() {
    shared ??= (async () => {
        const program = await context.program()
        const process = await program.findOrCreateProcess({ name: "server", server: true, client: false })
        await process.server.waitReady()
        process.server.subscribe("folder.changed", payload => { for (const follow of followers.folder) follow((payload as { path: string }).path) })
        process.server.subscribe("clipboard.changed", payload => { for (const follow of followers.clipboard) follow(payload as Clipboard) })
        process.server.subscribe("tasks.changed", payload => { for (const follow of followers.tasks) follow(payload as readonly Task[]) })
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

/** A file's bytes, or its first `length` bytes, streamed from the Server. */
export async function readFile(path: string, length?: number): Promise<FileContent> {
    const answer = await ask<{ size: number, modified: number, content: ReadableStream<Uint8Array> }>("file.read", { path, length })
    const bytes = new Uint8Array(await new Response(answer.content).arrayBuffer())
    return { bytes, size: answer.size, modified: answer.modified }
}

/** Follows the folders that change, from any window or from outside Files. */
export function followFolders(follow: (path: string) => void) {
    followers.folder.add(follow)
    return () => { followers.folder.delete(follow) }
}

/** Follows the clipboard, from its current state on. */
export function followClipboard(follow: (clipboard: Clipboard) => void) {
    followers.clipboard.add(follow)
    void ask<Clipboard>("clipboard.get").then(clipboard => { if (followers.clipboard.has(follow)) follow(clipboard) })
    return () => { followers.clipboard.delete(follow) }
}

/** Follows the long operations of every Files window, from those running now on. */
export function followTasks(follow: (tasks: readonly Task[]) => void) {
    followers.tasks.add(follow)
    void ask<readonly Task[]>("tasks.list").then(tasks => { if (followers.tasks.has(follow)) follow(tasks) })
    return () => { followers.tasks.delete(follow) }
}

export function stopTask(id: string) {
    return ask("tasks.stop", { id })
}

export function dismissTask(id: string) {
    return ask("tasks.dismiss", { id })
}

/** Copying and moving whole folders can take a while; bringing a file from the device even longer. */
const long = 30 * 60_000

type Created = Readonly<{ path: string }>
type Placed = Readonly<{ paths: readonly string[] }>

export function createFolder(folder: string, name?: string) {
    return ask<Created>("folder.create", { folder, name })
}

export function createFile(folder: string) {
    return ask<Created>("file.create", { folder })
}

export function renameEntry(path: string, name: string) {
    return ask<Created>("entry.rename", { path, name })
}

export function copyEntries(paths: readonly string[], destination: string) {
    return ask<Placed>("entries.copy", { paths, destination }, long)
}

export function moveEntries(paths: readonly string[], destination: string) {
    return ask<Placed>("entries.move", { paths, destination }, long)
}

export function trashEntries(paths: readonly string[]) {
    return ask("entries.trash", { paths }, long)
}

/** A new file in a folder, its bytes streamed to the Server as they are read; its size lets the task show how far it is. */
export function writeFile(folder: string, name: string, content: ReadableStream<Uint8Array>, size?: number) {
    return ask<Created>("file.write", { folder, name, size, content }, long)
}

export function setClipboard(clipboard: Clipboard) {
    return ask("clipboard.set", clipboard)
}

export function paste(destination: string) {
    return ask<Placed>("clipboard.paste", { destination }, long)
}

/** A file's bytes as one Blob for a download, streamed from the Server as a task every window shows. */
export async function fileBlob(path: string, type = "") {
    const answer = await ask<{ content: ReadableStream<Uint8Array> }>("file.read", { path, download: true }, long)
    const blob = await new Response(answer.content).blob()
    return type ? new Blob([blob], { type }) : blob
}

export type { Clipboard, Task }
