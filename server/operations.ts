import { createReadStream, createWriteStream } from "node:fs"
import { chmod, lstat, mkdir, readdir, readlink, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { basename, dirname, join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

/**
 * What the machine's files can be asked to do. Each operation answers the folders it changed, so
 * every window showing one of them can show it again.
 *
 * Nothing is ever replaced: an entry that would take the name of another gets a free name beside it,
 * as a copy does in every file manager, and deleting moves to the machine's Trash.
 */

/**
 * How a long operation reports how far it is, and learns that it should stop: `measured` gives the
 * whole amount once known, `advanced` each part done, in the unit the operation counts in.
 */
export type Progress = Readonly<{ signal?: AbortSignal, measured?: (total: number) => void, advanced?: (amount: number) => void }>

/** The bytes an entry holds: a file's size, or all the files inside a folder. */
async function sizeOf(path: string): Promise<number> {
    const details = await lstat(path)
    if (!details.isDirectory()) return details.isFile() ? details.size : 0
    let total = 0
    for (const name of await readdir(path)) total += await sizeOf(join(path, name))
    return total
}

/** Counts the bytes going through a stream. */
function counting(advanced: Progress["advanced"]) {
    return new Transform({ transform(chunk: Buffer, _encoding, done) { advanced?.(chunk.length); done(null, chunk) } })
}

/**
 * Copies one entry to a path that is free: a folder with everything inside it, a file byte by byte,
 * a link as the link it is. Times and permissions go with it; what is neither file, folder, nor link,
 * such as a socket, is left out. A copy that fails or is stopped leaves nothing behind.
 */
async function copyEntry(source: string, target: string, progress: Progress) {
    async function copy(from: string, to: string) {
        progress.signal?.throwIfAborted()
        const details = await lstat(from)
        if (details.isDirectory()) {
            await mkdir(to, { mode: details.mode })
            for (const name of await readdir(from)) await copy(join(from, name), join(to, name))
        }
        else if (details.isSymbolicLink()) {
            await symlink(await readlink(from), to)
            return
        }
        else if (details.isFile()) {
            await pipeline(createReadStream(from), counting(progress.advanced), createWriteStream(to, { flags: "wx", mode: details.mode }), { signal: progress.signal })
        }
        else return
        await utimes(to, details.atime, details.mtime)
    }
    try {
        await copy(source, target)
    }
    catch (error) {
        await rm(target, { recursive: true, force: true })
        throw error
    }
}

async function exists(path: string) {
    return lstat(path).then(() => true, () => false)
}

/** A name to give an entry: one that cannot leave its folder or name nothing. */
export function checkName(name: string) {
    if (!name.trim()) throw new Error("A name cannot be empty.")
    if (name.includes("/") || name.includes("\0")) throw new Error("A name cannot contain “/”.")
    if (name === "." || name === "..") throw new Error(`“${name}” cannot be a name.`)
    if (Buffer.byteLength(name) > 255) throw new Error("This name is too long.")
    return name
}

/**
 * The first free name in a folder: the name itself, then with a number, or for a copy with "copy" and
 * then a number. A file keeps its extension at the end; a folder has none.
 */
export async function freeName(folder: string, name: string, options: Readonly<{ copy?: boolean, isFolder?: boolean }> = {}) {
    const dot = options.isFolder ? -1 : name.lastIndexOf(".")
    const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
    const candidate = (number: number) => options.copy
        ? `${base} copy${number === 1 ? "" : ` ${number}`}${extension}`
        : number === 1 ? name : `${base} ${number}${extension}`
    for (let number = 1; ; number++) if (!await exists(join(folder, candidate(number)))) return candidate(number)
}

async function isFolder(path: string) {
    return (await lstat(path)).isDirectory()
}

/** A new, empty folder with a free name. */
export async function createFolder(folder: string, name = "untitled folder") {
    const path = join(folder, await freeName(folder, checkName(name), { isFolder: true }))
    await mkdir(path)
    return { path, changed: [folder] }
}

/** A new, empty file with a free name. */
export async function createFile(folder: string, name = "untitled.txt") {
    const path = join(folder, await freeName(folder, checkName(name)))
    await writeFile(path, "", { flag: "wx" })
    return { path, changed: [folder] }
}

/**
 * Saves new text into a file that already exists: an edit of that file, not a new entry taking its
 * place. It is written beside the file first and then put in its place in one step, so the file is
 * never left half written, and it keeps its permissions.
 */
export async function saveText(path: string, text: string) {
    const current = await stat(path)
    if (!current.isFile()) throw new Error("Only a file can be saved")
    const folder = dirname(path)
    const draft = join(folder, `.${basename(path)}.saving-${process.pid}-${Date.now()}`)
    try {
        await writeFile(draft, text, { flag: "wx" })
        await chmod(draft, current.mode & 0o7777)
        await rename(draft, path)
    }
    catch (error) {
        await rm(draft, { force: true })
        throw error
    }
    return { path, changed: [folder] }
}

/** Gives an entry another name in its folder; a name already taken there is refused. */
export async function renameEntry(path: string, name: string) {
    const folder = dirname(path)
    const target = join(folder, checkName(name))
    if (target === path) return { path, changed: [] as string[] }
    // On a machine that ignores letter case, a new case of the same name is the same entry.
    const [from, to] = await Promise.all([lstat(path), lstat(target).catch(() => null)])
    if (to && (to.ino !== from.ino || to.dev !== from.dev)) throw new Error(`“${name}” is already taken in this folder.`)
    await rename(path, target)
    return { path: target, changed: [folder] }
}

function inside(path: string, folder: string) {
    return path === folder || path.startsWith(folder === "/" ? "/" : `${folder}/`)
}

function refuseInsideItself(path: string, destination: string) {
    if (inside(destination, path)) throw new Error(`“${basename(path)}” cannot go inside itself.`)
}

/**
 * Copies entries into a folder; a copy beside its original, or of a taken name, is named a copy.
 * It counts in bytes. Entries copied before a stop stay; the one being copied leaves nothing.
 */
export async function copyEntries(paths: readonly string[], destination: string, progress: Progress = {}) {
    for (const path of paths) refuseInsideItself(path, destination)
    let total = 0
    for (const path of paths) total += await sizeOf(path)
    progress.measured?.(total)
    const created: string[] = []
    for (const path of paths) {
        const target = join(destination, await freeName(destination, basename(path), { copy: await exists(join(destination, basename(path))), isFolder: await isFolder(path) }))
        await copyEntry(path, target, progress)
        created.push(target)
    }
    return { paths: created, changed: [destination] }
}

/** Moves one entry to a path, across disks too, where a plain rename cannot. */
async function moveTo(path: string, target: string, signal?: AbortSignal) {
    try {
        await rename(path, target)
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
        await copyEntry(path, target, { signal })
        await rm(path, { recursive: true, force: true })
    }
}

/**
 * Moves entries into a folder; one already there stays, and a taken name gets a free one. It counts
 * in entries.
 */
export async function moveEntries(paths: readonly string[], destination: string, progress: Progress = {}) {
    const moving = paths.filter(path => dirname(path) !== destination)
    for (const path of moving) refuseInsideItself(path, destination)
    progress.measured?.(moving.length)
    const moved: string[] = []
    const changed = new Set<string>()
    for (const path of moving) {
        progress.signal?.throwIfAborted()
        const target = join(destination, await freeName(destination, basename(path), { isFolder: await isFolder(path) }))
        await moveTo(path, target, progress.signal)
        moved.push(target)
        changed.add(dirname(path)).add(destination)
        progress.advanced?.(1)
    }
    return { paths: moved, changed: [...changed] }
}

/**
 * Where this machine keeps its Trash, and what it records beside each entry: macOS keeps the entries
 * alone; Linux and the like follow the freedesktop.org Trash, whose info lets them be put back.
 */
function trashOf(): Readonly<{ files: string, info: string | null }> {
    if (platform() === "darwin") return { files: join(homedir(), ".Trash"), info: null }
    if (platform() === "win32") throw new Error("Files cannot use the Trash on Windows yet.")
    const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
    return { files: join(data, "Trash", "files"), info: join(data, "Trash", "info") }
}

/** Moves entries to the machine's Trash, from where they can still be brought back. It counts in entries. */
export async function trashEntries(paths: readonly string[], progress: Progress = {}) {
    const trash = trashOf()
    progress.measured?.(paths.length)
    await mkdir(trash.files, { recursive: true })
    if (trash.info) await mkdir(trash.info, { recursive: true })
    const changed = new Set<string>()
    for (const path of paths) {
        progress.signal?.throwIfAborted()
        if (inside(trash.files, path)) throw new Error(`“${basename(path) || "/"}” holds the Trash itself.`)
        const name = await freeName(trash.files, basename(path), { isFolder: await isFolder(path) })
        if (trash.info) {
            const date = new Date(), pad = (value: number) => String(value).padStart(2, "0")
            const deleted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
            await writeFile(join(trash.info, `${name}.trashinfo`), `[Trash Info]\nPath=${path.split("/").map(encodeURIComponent).join("/")}\nDeletionDate=${deleted}\n`, { flag: "wx" })
        }
        await moveTo(path, join(trash.files, name), progress.signal)
        changed.add(dirname(path))
        progress.advanced?.(1)
    }
    return { changed: [...changed] }
}

/** Writes a new file into a folder from a stream, under a free name, counting in bytes; a failed or stopped write leaves nothing. */
export async function writeNewFile(folder: string, name: string, content: ReadableStream<Uint8Array>, progress: Progress = {}) {
    const path = join(folder, await freeName(folder, checkName(name)))
    try {
        await pipeline(Readable.fromWeb(content as import("node:stream/web").ReadableStream<Uint8Array>), counting(progress.advanced), createWriteStream(path, { flags: "wx" }), { signal: progress.signal })
    }
    catch (error) {
        await rm(path, { force: true })
        throw error
    }
    return { path, changed: [folder] }
}
