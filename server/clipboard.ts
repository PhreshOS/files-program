/** What was copied or cut, the same in every Files window. */
export type Clipboard = Readonly<{ mode: "copy" | "cut", paths: readonly string[] }> | null

/**
 * What was copied or cut, kept by the one Files Server so every window pastes the same thing, and
 * announced whenever it changes.
 */
export function clipboardHolder(announce: (clipboard: Clipboard) => void) {
    let clipboard: Clipboard = null
    return {
        get: () => clipboard,
        set(next: Clipboard) {
            clipboard = next
            announce(clipboard)
        }
    }
}
