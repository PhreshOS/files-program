import { context } from "@phreshos/server"
import { z } from "zod"
import { entryAt, existingFolders, home, listFolder, readFile } from "./folders"
import { copyEntries, createFile, createFolder, moveEntries, renameEntry, trashEntries, writeNewFile } from "./operations"
import { folderWatch } from "./watch"

const absolutePath = z.string().startsWith("/")
const paths = z.array(absolutePath).min(1).max(10_000)

/** A folder shown in a window changed; every window showing it lists it again. */
const watch = folderWatch(path => context.publish("folder.changed", { path }))

/** Runs one change and announces the folders it changed. */
async function change<Result extends { changed: readonly string[] }>(run: Promise<Result>) {
    const result = await run
    watch.changed(result.changed)
    return result
}

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

/** A file's size and time, and its bytes as a stream: all of them, or from `offset`, at most `length`. */
context.answer("file.read", ({ payload }) => {
    const request = z.object({ path: absolutePath, offset: z.number().int().nonnegative().default(0), length: z.number().int().nonnegative().optional() }).parse(payload)
    return readFile(request.path, request.offset, request.length)
})

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
    const { folder, name, content } = z.object({ folder: absolutePath, name: z.string(), content: z.instanceof(ReadableStream) }).parse(payload)
    return change(writeNewFile(folder, name, content as ReadableStream<Uint8Array>))
})

context.answer("entry.rename", ({ payload }) => {
    const { path, name } = z.object({ path: absolutePath, name: z.string() }).parse(payload)
    return change(renameEntry(path, name))
})

context.answer("entries.copy", ({ payload }) => {
    const request = z.object({ paths, destination: absolutePath }).parse(payload)
    return change(copyEntries(request.paths, request.destination))
})

context.answer("entries.move", ({ payload }) => {
    const request = z.object({ paths, destination: absolutePath }).parse(payload)
    return change(moveEntries(request.paths, request.destination))
})

context.answer("entries.trash", ({ payload }) => change(trashEntries(z.object({ paths }).parse(payload).paths)))

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
    if (clipboard.mode === "copy") return change(copyEntries(clipboard.paths, destination))
    const result = await change(moveEntries(clipboard.paths, destination))
    setClipboard(null)
    return result
})
