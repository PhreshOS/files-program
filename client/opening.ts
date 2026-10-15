import { addressOf, pathOf, type OpenTarget } from "@phreshos/core"

/** A folder as a `terminal:` address: a shell there, opened with whatever the owner opens shells with. */
export function terminalAddress(path: string) {
    return addressOf(path, "terminal")
}

/** A file or folder as a `file:` address, as the System opens it. */
export function fileAddress(path: string) {
    return addressOf(path)
}

/** The folder a `file:` address names when Files was opened to show it, or `null`. */
export function openedFolder(opened: OpenTarget | null) {
    if (opened?.type !== "inode/directory" || !opened.uri.startsWith("file:")) return null
    return pathOf(opened.uri)
}
