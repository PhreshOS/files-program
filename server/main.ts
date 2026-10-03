import { basename, dirname } from "node:path"
import { context } from "@phreshos/server"
import { z } from "zod"
import { clipboardHolder } from "./clipboard"
import { entryAt, existingFolders, home, listFolder, readFile } from "./folders"
import { copyEntries, createFile, createFolder, moveEntries, renameEntry, saveText, trashEntries, writeNewFile } from "./operations"
import { shelfHolder } from "./shelf"
import { taskList } from "./tasks"
import { folderWatch } from "./watch"
import { filesService, panelLaunch, panelShown } from "./launches"

const program = await context.program()

const absolutePath = z.string().startsWith("/")

/** A place on the Desktop's plane: pixels, or a share of the view such as "50% - 200". */
const value = z.union([z.number(), z.string().min(1).max(100)])
const paths = z.array(absolutePath).min(1).max(10_000)

/** A folder shown in a window changed; every window showing it lists it again. */
const watch = folderWatch(path => context.publish("folder.changed", { path }))

/** The long operations every window shows, announced as they move. */
const tasks = taskList(list => context.publish("tasks.changed", list))

/** What was copied or cut, announced to every window when it changes. */
const clipboard = clipboardHolder(held => context.publish("clipboard.changed", held))

/** What was put on the shelf, announced to every window when it changes; kept in the Program's own data. */
const shelfFolder = program.data.navigate("Shelf")
await shelfFolder.create()
const shelf = await shelfHolder(await shelfFolder.path(), held => context.publish("shelf.changed", held))

/** Runs one change and announces the folders it changed. */
async function change<Result extends { changed: readonly string[] }>(run: Promise<Result>) {
    const result = await run
    watch.changed(result.changed)
    return result
}

/**
 * Runs one change that may take long as a task, and announces the folders it may have touched when it
 * ends, however it ends: a copy stopped halfway has still made what it made.
 */
async function task<Result>(folders: readonly string[], ...[kind, title, unit, operation]: Parameters<typeof tasks.run<Result>>) {
    try {
        return await tasks.run(kind, title, unit, operation)
    }
    finally {
        watch.changed(folders)
    }
}

/** A name as a task's title quotes it. */
const quoted = (name: string) => `“${name}”`

/** An entry or a folder in a task's title, by its name. */
const named = (path: string) => quoted(basename(path) || "/")

/** Some entries in a task's title: one by its name, several by their number. */
const entriesIn = (paths: readonly string[]) => paths.length === 1 ? named(paths[0]!) : `${paths.length} items`

/** Remembered once Files has recorded its start with the System. */
const startupRecorded = "startup.recorded"

// The Service starts with the System, so other Programs find it present. Files records that once; an
// owner who removes the record keeps it removed, until they turn the panel on again.
if (!await program.store.get<boolean>(startupRecorded)) {
    await program.startup.set(filesService)
    await program.store.set(startupRecorded, true)
}

// A Program has one start with the System, and here it is the Server's; the panel starts from it.
if (await program.store.get<boolean>(panelShown)) await program.findOrCreateProcess(panelLaunch)

/**
 * Another Program, or anyone, shows a folder or a file in Files: a new window, starting there. It
 * stands where the asker places it, such as beside the window it was asked from.
 */
context.answer("path.show", async ({ payload }) => {
    const { path, position } = z.object({ path: absolutePath, position: z.object({ x: value, y: value }).optional() }).parse(payload)
    await program.createProcess({ server: false, client: { title: basename(path) || "/", ...(position ? { position } : {}) }, options: { path } })
})

/** The home folder of the user running PhreshOS, where Files opens. */
context.answer("home", () => home())

/** The entries directly inside one folder, which is watched from then on. */
context.answer("folder.list", async ({ payload }) => {
    const { path } = z.object({ path: absolutePath }).parse(payload)
    const entries = await listFolder(path)
    watch.follow(path)
    return entries
})

/** One entry by its path, as a folder lists it. */
context.answer("entry.get", ({ payload }) => entryAt(z.object({ path: absolutePath }).parse(payload).path))

/** Which of the given folders exist, such as the usual folders of a home. */
context.answer("folders.existing", ({ payload }) => existingFolders(z.object({ paths: z.array(absolutePath).max(100) }).parse(payload).paths))

/**
 * A file's size and time, and its bytes as a stream: all of them, or from `offset`, at most `length`.
 * A download is a task every window shows, until its bytes have all been read.
 */
context.answer("file.read", async ({ payload }) => {
    const request = z.object({ path: absolutePath, offset: z.number().int().nonnegative().default(0), length: z.number().int().nonnegative().optional(), download: z.boolean().default(false) }).parse(payload)
    const file = await readFile(request.path, request.offset, request.length)
    if (!request.download) return file
    return { ...file, content: downloading(file.content, tasks.start("download", `Downloading ${named(request.path)}`, "bytes", file.size)) }
})

/**
 * A file's bytes as a download task counts them: it ends when the last byte is read; stopping it
 * fails the download on the other side rather than ending it early; a reader that stops reading
 * simply leaves.
 */
function downloading(content: ReadableStream<Uint8Array>, download: ReturnType<typeof tasks.start>) {
    const reader = content.getReader()
    return new ReadableStream<Uint8Array>({
        start(controller) {
            download.progress.signal?.addEventListener("abort", () => {
                download.drop()
                controller.error(new Error("The download was stopped"))
                void reader.cancel().catch(() => undefined)
            })
        },
        async pull(controller) {
            try {
                const { done, value } = await reader.read()
                if (download.progress.signal?.aborted) return
                if (done) { download.finish(); controller.close() }
                else { download.progress.advanced?.(value.byteLength); controller.enqueue(value) }
            }
            catch (error) {
                download.fail(error)
                controller.error(error)
            }
        },
        cancel(reason) {
            download.drop()
            return reader.cancel(reason)
        }
    })
}

/** A new folder or an empty file in a folder, under a free name. */
context.answer("folder.create", ({ payload }) => {
    const { folder, name } = z.object({ folder: absolutePath, name: z.string().optional() }).parse(payload)
    return change(createFolder(folder, name))
})
context.answer("file.create", ({ payload }) => {
    const { folder, name } = z.object({ folder: absolutePath, name: z.string().optional() }).parse(payload)
    return change(createFile(folder, name))
})

/** A new file written from a stream, such as one brought from the owner's own device. */
context.answer("file.write", ({ payload }) => {
    const { folder, name, size, content } = z.object({ folder: absolutePath, name: z.string(), size: z.number().int().nonnegative().optional(), content: z.instanceof(ReadableStream) }).parse(payload)
    return task([folder], "upload", `Uploading ${quoted(name)} to ${named(folder)}`, "bytes", progress => {
        if (size !== undefined) progress.measured?.(size)
        return writeNewFile(folder, name, content as ReadableStream<Uint8Array>, progress)
    })
})

/** New text for a file that exists, as edited where Files shows it. */
context.answer("file.save", ({ payload }) => {
    const { path, text } = z.object({ path: absolutePath, text: z.string() }).parse(payload)
    return change(saveText(path, text))
})

/** Another name for an entry, in its folder. */
context.answer("entry.rename", ({ payload }) => {
    const { path, name } = z.object({ path: absolutePath, name: z.string() }).parse(payload)
    return change(renameEntry(path, name))
})

/** Copying and moving entries are tasks: what they touched is announced however they end. */
function copy(from: readonly string[], destination: string) {
    return task([destination], "copy", `Copying ${entriesIn(from)} to ${named(destination)}`, "bytes", progress => copyEntries(from, destination, progress))
}

function move(from: readonly string[], destination: string) {
    return task([destination, ...from.map(dirname)], "move", `Moving ${entriesIn(from)} to ${named(destination)}`, "items", progress => moveEntries(from, destination, progress))
}

context.answer("entries.copy", ({ payload }) => {
    const request = z.object({ paths, destination: absolutePath }).parse(payload)
    return copy(request.paths, request.destination)
})

context.answer("entries.move", ({ payload }) => {
    const request = z.object({ paths, destination: absolutePath }).parse(payload)
    return move(request.paths, request.destination)
})

/** Entries moved to the machine's Trash, as a task. */
context.answer("entries.trash", ({ payload }) => {
    const from = z.object({ paths }).parse(payload).paths
    return task(from.map(dirname), "trash", `Moving ${entriesIn(from)} to the Trash`, "items", progress => trashEntries(from, progress))
})

/** The long operations running now, and those that failed, as every window shows them. */
context.answer("tasks.list", () => tasks.list())

/** Stops a task; what it finished stays. */
context.answer("tasks.stop", ({ payload }) => { tasks.stop(z.object({ id: z.string() }).parse(payload).id) })

/** Lets go of a failed task, once its problem has been seen. */
context.answer("tasks.dismiss", ({ payload }) => { tasks.dismiss(z.object({ id: z.string() }).parse(payload).id) })

/** What was copied or cut. */
context.answer("clipboard.get", () => clipboard.get())

context.answer("clipboard.set", ({ payload }) => {
    clipboard.set(z.object({ mode: z.enum(["copy", "cut"]), paths }).nullable().parse(payload))
})

/**
 * Pastes into a folder: a copy as often as wanted; a cut once, since its entries have moved and
 * nothing is left to paste.
 */
context.answer("clipboard.paste", async ({ payload }) => {
    const { destination } = z.object({ destination: absolutePath }).parse(payload)
    const held = clipboard.get()
    if (!held) return { paths: [] }
    if (held.mode === "copy") return copy(held.paths, destination)
    const result = await move(held.paths, destination)
    clipboard.set(null)
    return result
})

/**
 * The entries on the shelf. One that is gone from where it was is gone from the shelf too; the
 * folders they are in are watched, so windows learn when that happens.
 */
context.answer("shelf.list", async () => {
    const held = shelf.get()
    const found = await Promise.all(held.map(path => entryAt(path).catch(() => null)))
    const gone = held.filter((_, index) => !found[index])
    if (gone.length) shelf.remove(gone)
    for (const folder of new Set(held.map(dirname))) watch.follow(folder)
    return found.filter(entry => entry !== null)
})

/** The shelf's own folder, where files from the device are written before they are put on it. */
context.answer("shelf.folder", () => shelf.folder)

context.answer("shelf.add", ({ payload }) => { shelf.add(z.object({ paths }).parse(payload).paths) })

/**
 * Takes entries off the shelf. Those in the shelf's own folder have nowhere else to be, so they go
 * to the Trash, from where they can still come back.
 */
context.answer("shelf.remove", async ({ payload }) => {
    const removed = z.object({ paths }).parse(payload).paths
    shelf.remove(removed)
    const owned = removed.filter(shelf.owns)
    if (owned.length) await task([shelf.folder], "trash", `Moving ${entriesIn(owned)} to the Trash`, "items", progress => trashEntries(owned, progress))
})
