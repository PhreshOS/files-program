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

/**
 * Some of a file's bytes, with its size and time. One answer carries at most a few megabytes, so a
 * large file travels as several answers and never holds the connection for long.
 */
const pieceLimit = 4 * 1024 * 1024
context.answer("file.read", ({ payload }) => {
    const request = z.object({ path: absolutePath, offset: z.number().int().nonnegative().default(0), length: z.number().int().nonnegative().max(pieceLimit) }).parse(payload)
    return readFile(request.path, request.offset, request.length)
})
