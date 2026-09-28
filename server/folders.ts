import { lstat, open, readdir, stat } from "node:fs/promises"
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

/** Some of a file's bytes, from `offset`, at most `length` of them, with its size and time. */
export async function readFile(path: string, offset: number, length: number) {
    const file = await open(path, "r")
    try {
        const details = await file.stat()
        if (details.isDirectory()) throw new Error(`EISDIR: ${path} is a folder`)
        const bytes = new Uint8Array(Math.max(0, Math.min(details.size - offset, length)))
        let read = 0
        while (read < bytes.length) {
            const { bytesRead } = await file.read(bytes, read, bytes.length - read, offset + read)
            if (bytesRead === 0) break
            read += bytesRead
        }
        return { bytes: bytes.subarray(0, read), size: details.size, modified: details.mtimeMs }
    }
    finally {
        await file.close()
    }
}
