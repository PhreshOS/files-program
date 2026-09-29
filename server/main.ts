import { context } from "@phreshos/server"
import { z } from "zod"
import { entryAt, existingFolders, home, listFolder, readFile } from "./folders"
import { basename, dirname } from "node:path"
import { copyEntries, createFile, createFolder, moveEntries, renameEntry, trashEntries, writeNewFile } from "./operations"
import { taskList } from "./tasks"
import { folderWatch } from "./watch"

const absolutePath = z.string().startsWith("/")
const paths = z.array(absolutePath).min(1).max(10_000)

/** A folder shown in a window changed; every window showing it lists it again. */
const watch = folderWatch(path => context.publish("folder.changed", { path }))

/** The long operations every window shows, announced as they move. */
const tasks = taskList(list => context.publish("tasks.changed", list))

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

/** What a task does to some entries, in words: one by its name, several by their number. */
function entriesIn(paths: readonly string[]) {
    return paths.length === 1 ? `“${basename(paths[0]!)}”` : `${paths.length} items`
}

const named = (path: string) => `“${basename(path) || "/"}”`

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
    const { parent, name } = z.object({ parent: absolutePath, name: z.string().optional() }).parse(payload)
    return change(createFolder(parent, name))
})
context.answer("file.create", ({ payload }) => {
    const { parent, name } = z.object({ parent: absolutePath, name: z.string().optional() }).parse(payload)
    return change(createFile(parent, name))
})

/** A new file written from a stream, such as one brought from the owner's own device. */
context.answer("file.write", ({ payload }) => {
    const { folder, name, size, content } = z.object({ folder: absolutePath, name: z.string(), size: z.number().int().nonnegative().optional(), content: z.instanceof(ReadableStream) }).parse(payload)
    return task([folder], "upload", `Uploading “${name}” to ${named(folder)}`, "bytes", progress => {
        if (size !== undefined) progress.measured?.(size)
        return writeNewFile(folder, name, content as ReadableStream<Uint8Array>, progress)
    })
})

context.answer("entry.rename", ({ payload }) => {
    const { path, name } = z.object({ path: absolutePath, name: z.string() }).parse(payload)
    return change(renameEntry(path, name))
})

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

/**
 * What was copied or cut, kept here so every Files window pastes the same thing. A cut is pasted once:
 * the entries have moved, and nothing is left to paste.
 */
type Clipboard = Readonly<{ mode: "copy" | "cut", paths: readonly string[] }> | null
let clipboard: Clipboard = null

function setClipboard(next: Clipboard) {
    clipboard = next
    context.publish("clipboard.changed", clipboard)
}

context.answer("clipboard.get", () => clipboard)

context.answer("clipboard.set", ({ payload }) => {
    setClipboard(z.object({ mode: z.enum(["copy", "cut"]), paths }).nullable().parse(payload))
})

context.answer("clipboard.paste", async ({ payload }) => {
    const { destination } = z.object({ destination: absolutePath }).parse(payload)
    if (!clipboard) return { paths: [], changed: [] }
    if (clipboard.mode === "copy") return copy(clipboard.paths, destination)
    const result = await move(clipboard.paths, destination)
    setClipboard(null)
    return result
})
