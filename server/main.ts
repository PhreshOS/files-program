import { context } from "@phreshos/server"
import { z } from "zod"
import { entryAt, existingFolders, home, listFolder, readFile } from "./folders"

const absolutePath = z.string().startsWith("/")

/** The home folder of the user running PhreshOS, where Files opens. */
context.answer("home", () => home())

/** The entries directly inside one folder. */
context.answer("folder.list", ({ payload }) => listFolder(z.object({ path: absolutePath }).parse(payload).path))

/** One entry by its path, as a folder lists it. */
context.answer("entry.get", ({ payload }) => entryAt(z.object({ path: absolutePath }).parse(payload).path))

/** Which of the given folders exist, such as the usual folders of a home. */
context.answer("folders.existing", ({ payload }) => existingFolders(z.object({ paths: z.array(absolutePath).max(100) }).parse(payload).paths))

/** A file's size and time, and its bytes as a stream: all of them, or from `offset`, at most `length`. */
context.answer("file.read", ({ payload }) => {
    const request = z.object({ path: absolutePath, offset: z.number().int().nonnegative().default(0), length: z.number().int().nonnegative().optional() }).parse(payload)
    return readFile(request.path, request.offset, request.length)
})
