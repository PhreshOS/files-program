import type { DropItem } from "@phreshos/react-ui"
import { copyEntries, createFolder, moveEntries, writeFile } from "./folders"

/**
 * What a drag of entries carries: their paths, as JSON, in one native type, so any Files window can
 * read it, from its rows or from the space around them. Other applications get the paths as text.
 */
export const entriesType = "application/x-phreshos-files+json"

export function dragItems(paths: readonly string[]) {
    return [{ [entriesType]: JSON.stringify(paths), "text/plain": paths.join("\n") }]
}

/** A file or a folder from the owner's own device, as a drop brings it. */
type DeviceEntry =
    | Readonly<{ kind: "file", name: string, file: () => Promise<File> }>
    | Readonly<{ kind: "folder", name: string, entries: () => AsyncIterable<DeviceEntry> }>

/** What a drop brings: entries of this machine, or files and folders from the owner's device. */
export type Incoming = Readonly<{ paths: readonly string[] }> | Readonly<{ device: readonly DeviceEntry[] }>

/** What arrives on a row or a collection, as React UI hands it over. */
export async function fromDropItems(items: readonly DropItem[]): Promise<Incoming | null> {
    for (const item of items) if (item.kind === "text" && item.types.has(entriesType)) return { paths: JSON.parse(await item.getText(entriesType)) }
    const device = items.flatMap(deviceEntry)
    return device.length ? { device } : null
}

function deviceEntry(item: DropItem): DeviceEntry[] {
    if (item.kind === "file") return [{ kind: "file", name: item.name, file: () => item.getFile() }]
    if (item.kind === "directory") return [{
        kind: "folder", name: item.name,
        entries: async function* () { for await (const child of item.getEntries()) yield* deviceEntry(child) }
    }]
    return []
}

/** What arrives on the space around the collection, read from the browser's drop while it lasts. */
export function fromDataTransfer(data: DataTransfer): Incoming | null {
    const paths = data.getData(entriesType)
    if (paths) return { paths: JSON.parse(paths) }
    const device = [...data.items].flatMap(item => {
        const entry = item.kind === "file" ? item.webkitGetAsEntry() : null
        return entry ? [nativeEntry(entry)] : []
    })
    return device.length ? { device } : null
}

function nativeEntry(entry: FileSystemEntry): DeviceEntry {
    if (entry.isFile) return { kind: "file", name: entry.name, file: () => new Promise((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)) }
    return {
        kind: "folder", name: entry.name,
        entries: async function* () {
            const reader = (entry as FileSystemDirectoryEntry).createReader()
            // A folder is read in batches, until one comes back empty.
            for (;;) {
                const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
                if (!batch.length) return
                for (const child of batch) yield nativeEntry(child)
            }
        }
    }
}

/**
 * Brings what was dropped into a folder: entries of this machine move there, or are copied; files
 * and folders from the device are written there, a folder with everything inside it.
 */
export async function bring(incoming: Incoming, folder: string, operation: "move" | "copy"): Promise<readonly string[]> {
    if ("paths" in incoming) return (await (operation === "copy" ? copyEntries : moveEntries)(incoming.paths, folder)).paths
    const paths: string[] = []
    for (const entry of incoming.device) paths.push(await upload(entry, folder))
    return paths
}

async function upload(entry: DeviceEntry, folder: string): Promise<string> {
    if (entry.kind === "file") return (await writeFile(folder, entry.name, (await entry.file()).stream())).path
    const { path } = await createFolder(folder, entry.name)
    for await (const child of entry.entries()) await upload(child, path)
    return path
}

/** Files chosen from the device, such as with the browser's file picker. */
export function fromFiles(files: readonly File[]): Incoming {
    return { device: files.map(file => ({ kind: "file", name: file.name, file: async () => file })) }
}
