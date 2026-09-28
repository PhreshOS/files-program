import { createReadStream } from "node:fs"
import { lstat, readdir, stat } from "node:fs/promises"
import { Readable } from "node:stream"
import { homedir } from "node:os"
import { basename, join } from "node:path"

/** One entry of a folder, as the Server answers it. */
export type FolderEntry = Readonly<{
    /** The absolute path, which also identifies the entry. */
    path: string
    name: string
    type: "folder" | "file"
    /** Bytes; folders have none. */
    size?: number
    /** Unix milliseconds. */
    modified: number
}>

export function home() {
    return homedir()
}

/**
 * The entries directly inside one folder. A link counts as what it points to; a link that points
 * nowhere is a file of its own.
 */
export async function listFolder(path: string): Promise<FolderEntry[]> {
    const children = await readdir(path, { withFileTypes: true })
    return Promise.all(children.map(async (child): Promise<FolderEntry> => {
        const childPath = join(path, child.name)
        const details = await stat(childPath).catch(() => lstat(childPath)).catch(() => null)
        const folder = details?.isDirectory() ?? child.isDirectory()
        return folder
            ? { path: childPath, name: child.name, type: "folder", modified: details?.mtimeMs ?? 0 }
            : { path: childPath, name: child.name, type: "file", size: details?.size ?? 0, modified: details?.mtimeMs ?? 0 }
    }))
}

/** One entry by its path, as a folder lists it. */
export async function entryAt(path: string): Promise<FolderEntry> {
    const details = await stat(path)
    const name = basename(path) || "/"
    return details.isDirectory()
        ? { path, name, type: "folder", modified: details.mtimeMs }
        : { path, name, type: "file", size: details.size, modified: details.mtimeMs }
}

/** Which of these folders exist. */
export async function existingFolders(paths: readonly string[]) {
    const found = await Promise.all(paths.map(path => stat(path).then(details => details.isDirectory(), () => false)))
    return paths.filter((_, index) => found[index])
}

/**
 * A file's size and time, and its bytes as a stream: all of them, or from `offset`, at most `length`.
 * The bytes are read only as the reader asks for them, however large the file.
 */
export async function readFile(path: string, offset = 0, length?: number) {
    const details = await stat(path)
    if (details.isDirectory()) throw new Error(`EISDIR: ${path} is a folder`)
    const end = length === undefined ? undefined : offset + length - 1
    const content = length === 0 ? new ReadableStream<Uint8Array>({ start: controller => controller.close() }) : Readable.toWeb(createReadStream(path, { start: offset, end })) as ReadableStream<Uint8Array>
    return { size: details.size, modified: details.mtimeMs, content }
}
