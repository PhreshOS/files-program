import { watch, type FSWatcher } from "node:fs"

/** The most folders watched at once; the one shown longest ago stops being watched first. */
const most = 64

/** How long changes gather before a folder is announced once for all of them. */
const settle = 150

/**
 * Watches the folders windows show, and announces each change once it settles. A folder is watched
 * from the time a window lists it; the watch is kept for the folders listed most recently.
 */
export function folderWatch(announce: (path: string) => void) {
    const watched = new Map<string, FSWatcher>()
    const pending = new Map<string, ReturnType<typeof setTimeout>>()

    function changed(path: string) {
        clearTimeout(pending.get(path))
        pending.set(path, setTimeout(() => { pending.delete(path); announce(path) }, settle))
    }

    function forget(path: string) {
        watched.get(path)?.close()
        watched.delete(path)
    }

    return {
        /** Keeps a folder watched, as the most recently shown. */
        follow(path: string) {
            const current = watched.get(path)
            if (current) { watched.delete(path); watched.set(path, current); return }
            try {
                const watcher = watch(path, { persistent: false }, () => changed(path))
                // A folder that stops being watchable, such as one removed, is simply let go.
                watcher.on("error", () => forget(path))
                watched.set(path, watcher)
            }
            catch {
                return
            }
            if (watched.size > most) forget(watched.keys().next().value!)
        },
        /** Announces folders this Server changed itself, at once and without waiting for the watch. */
        changed(paths: readonly string[]) {
            for (const path of new Set(paths)) changed(path)
        }
    }
}
