import { readdir } from "node:fs/promises"
import { join } from "node:path"

/**
 * The shelf: entries kept at hand, the same in every Files window, and announced whenever it
 * changes. It holds references, newest first; an entry stays where it is. Files that come from the
 * device have no place on this machine yet, so they are written into the shelf's own folder first,
 * and are found there again when the Server starts.
 */
export async function shelfHolder(folder: string, announce: (paths: readonly string[]) => void) {
    let paths: readonly string[] = (await readdir(folder).catch(() => [])).filter(name => !name.startsWith(".")).map(name => join(folder, name))
    const set = (next: readonly string[]) => {
        paths = next
        announce(paths)
    }
    return {
        folder,
        get: () => paths,
        add: (added: readonly string[]) => set([...new Set([...added, ...paths])]),
        remove: (removed: readonly string[]) => set(paths.filter(path => !removed.includes(path))),
        /** Whether an entry lives in the shelf's own folder, so nothing else holds it. */
        owns: (path: string) => path.startsWith(folder + "/")
    }
}
