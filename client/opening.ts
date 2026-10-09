import type { OpenTarget } from "@phreshos/core"

/** A folder as a `terminal:` address: a shell there, opened with whatever the owner opens shells with. */
export function terminalAddress(path: string) {
    return `terminal://${path.split("/").map(encodeURIComponent).join("/")}`
}

/** The folder a `file:` address names when Files was opened to show it, or `null`. */
export function openedFolder(opened: OpenTarget | null) {
    if (opened?.type !== "inode/directory" || !opened.uri.startsWith("file:")) return null
    return decodeURIComponent(new URL(opened.uri).pathname) || null
}
