import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

// The Trash is exercised as on Linux, inside the test folder, so no real Trash is touched.
vi.mock("node:os", async original => ({ ...await original<typeof import("node:os")>(), platform: () => "linux" }))

const { checkName, copyEntries, createFile, createFolder, freeName, moveEntries, renameEntry, trashEntries, writeNewFile } = await import("../server/operations")

let root: string

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "files-operations-"))
    process.env.XDG_DATA_HOME = join(root, "data")
    await mkdir(join(root, "a"))
    await writeFile(join(root, "a", "note.txt"), "hello")
    await mkdir(join(root, "b"))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const names = async (folder: string) => (await readdir(folder)).sort()

test("free names keep the extension of a file, and never split a folder's name", async () => {
    expect(await freeName(join(root, "a"), "note.txt")).toBe("note 2.txt")
    expect(await freeName(join(root, "a"), "note.txt", { copy: true })).toBe("note copy.txt")
    expect(await freeName(join(root, "a"), "other.txt")).toBe("other.txt")
    await mkdir(join(root, "v1.2"))
    expect(await freeName(root, "v1.2", { isFolder: true })).toBe("v1.2 2")
})

test("new folders and files take the next free name", async () => {
    await createFolder(join(root, "b"))
    await createFolder(join(root, "b"))
    await createFile(join(root, "b"))
    expect(await names(join(root, "b"))).toEqual(["untitled folder", "untitled folder 2", "untitled.txt"])
})

test("renaming refuses a taken name and one that would leave the folder", async () => {
    await writeFile(join(root, "a", "other.txt"), "")
    await expect(renameEntry(join(root, "a", "note.txt"), "other.txt")).rejects.toThrow("already taken")
    expect(() => checkName("../x")).toThrow()
    expect(() => checkName("  ")).toThrow()
    const { path, changed } = await renameEntry(join(root, "a", "note.txt"), "renamed.txt")
    expect(path).toBe(join(root, "a", "renamed.txt"))
    expect(changed).toEqual([join(root, "a")])
})

test("a copy beside its original is named a copy; a folder is copied whole", async () => {
    await copyEntries([join(root, "a", "note.txt")], join(root, "a"))
    await copyEntries([join(root, "a")], join(root, "b"))
    expect(await names(join(root, "a"))).toEqual(["note copy.txt", "note.txt"])
    expect(await names(join(root, "b", "a"))).toEqual(["note copy.txt", "note.txt"])
    await expect(copyEntries([join(root, "a")], join(root, "a"))).rejects.toThrow("inside itself")
})

test("moving leaves entries already there, and takes a free name for a taken one", async () => {
    await writeFile(join(root, "b", "note.txt"), "other")
    const { paths, changed } = await moveEntries([join(root, "a", "note.txt")], join(root, "b"))
    expect(paths).toEqual([join(root, "b", "note 2.txt")])
    expect(changed.sort()).toEqual([join(root, "a"), join(root, "b")])
    expect(await readFile(join(root, "b", "note 2.txt"), "utf8")).toBe("hello")
    expect((await moveEntries([join(root, "b", "note.txt")], join(root, "b"))).paths).toEqual([])
})

test("the Trash keeps what was deleted, with what puts it back", async () => {
    await trashEntries([join(root, "a", "note.txt")])
    expect(await names(join(root, "a"))).toEqual([])
    expect(await names(join(root, "data", "Trash", "files"))).toEqual(["note.txt"])
    const info = await readFile(join(root, "data", "Trash", "info", "note.txt.trashinfo"), "utf8")
    expect(info).toContain(`Path=${join(root, "a", "note.txt")}`)
})

test("a written file takes a free name, and a failed write leaves nothing", async () => {
    await writeNewFile(join(root, "a"), "note.txt", new Blob(["new"]).stream())
    expect(await readFile(join(root, "a", "note 2.txt"), "utf8")).toBe("new")
    const failing = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("Lost")) } })
    await expect(writeNewFile(join(root, "a"), "broken.txt", failing)).rejects.toThrow("Lost")
    expect(await names(join(root, "a"))).toEqual(["note 2.txt", "note.txt"])
})

test("a copy counts its bytes, and one stopped halfway leaves nothing of the entry it was copying", async () => {
    await writeFile(join(root, "a", "big.bin"), new Uint8Array(3 * 1024 * 1024))
    let total = 0, done = 0
    await copyEntries([join(root, "a")], join(root, "b"), { measured: amount => { total = amount }, advanced: amount => { done += amount } })
    expect(total).toBe(3 * 1024 * 1024 + 5)
    expect(done).toBe(total)

    const controller = new AbortController()
    let copied = 0
    const stopping = copyEntries([join(root, "a", "big.bin")], join(root, "b"), { signal: controller.signal, advanced: amount => { copied += amount; if (copied > 0) controller.abort(new Error("Stopped")) } })
    await expect(stopping).rejects.toThrow()
    expect(await names(join(root, "b"))).toEqual(["a"])
})

test("tasks: one that ends leaves the list, one that fails stays with its problem, one stopped leaves", async () => {
    const { taskList } = await import("../server/tasks")
    const announced: unknown[] = []
    const tasks = taskList(list => announced.push(list))

    await tasks.run("copy", "Copying", "bytes", async progress => { progress.measured?.(10); progress.advanced?.(10) })
    expect(tasks.list()).toEqual([])

    await expect(tasks.run("move", "Moving", "items", async () => { throw new Error("Disk full") })).rejects.toThrow("Disk full")
    const [failed] = tasks.list()
    expect(failed).toMatchObject({ kind: "move", state: "failed", problem: "Disk full" })
    tasks.dismiss(failed!.id)
    expect(tasks.list()).toEqual([])

    const running = tasks.run("copy", "Copying", "bytes", progress => new Promise((_resolve, reject) => progress.signal?.addEventListener("abort", () => reject(progress.signal?.reason))))
    tasks.stop(tasks.list()[0]!.id)
    await expect(running).rejects.toThrow("Stopped")
    expect(tasks.list()).toEqual([])
})
