import { Menu } from "@phreshos/react-ui"
import { Archive, ArchiveX, ClipboardPaste, Copy, CopyPlus, FilePlus, FolderPlus, Link, Scissors, SquareArrowOutUpRight, Trash2 } from "@phreshos/react-ui/icons"
import type { Entry } from "./entries"
import { copyEntries, createFile, createFolder, paste, setClipboard, shelve, trashEntries, unshelve, type Clipboard } from "./files-server"
import WallpaperSubmenu, { wallpaperType } from "./wallpaper"

/** Where the menu was opened: on an entry of the tree, on the folder the tree shows, or on the shelf. */
export type MenuPlace = "tree" | "root" | "shelf"

/**
 * What the panel offers for one entry, the same things a Files window offers for it. Work that may
 * take long appears among the tasks of every Files window; renaming is left to a Files window.
 */
export default function EntryMenu({ entry, place, clipboard, onOpen }: Readonly<{
    entry: Entry
    place: MenuPlace
    clipboard: Clipboard
    onOpen: (entry: Entry) => void
}>) {
    const folder = entry.kind === "folder"
    const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/"
    const quietly = (run: () => Promise<unknown>) => void run().catch(() => undefined)

    function run(action: string) {
        switch (action) {
            case "open": onOpen(entry); break
            case "new-folder": quietly(() => createFolder(entry.path)); break
            case "new-file": quietly(() => createFile(entry.path)); break
            case "paste": quietly(() => paste(entry.path)); break
            case "duplicate": quietly(() => copyEntries([entry.path], parent)); break
            case "copy": case "cut": quietly(() => setClipboard({ mode: action, paths: [entry.path] })); break
            case "shelve": quietly(() => shelve([entry.path])); break
            case "unshelve": quietly(() => unshelve([entry.path])); break
            case "copy-path": quietly(() => navigator.clipboard.writeText(entry.path)); break
            case "trash": quietly(() => trashEntries([entry.path])); break
        }
    }

    return <Menu aria-label={entry.name} size="small" onAction={action => run(String(action))}>
        <Menu.Item id="open"><SquareArrowOutUpRight />Open in Files</Menu.Item>
        {wallpaperType(entry) && <WallpaperSubmenu entry={entry} />}
        {folder && place !== "shelf" && <>
            <Menu.Separator />
            <Menu.Item id="new-folder"><FolderPlus />New folder</Menu.Item>
            <Menu.Item id="new-file"><FilePlus />New text file</Menu.Item>
            <Menu.Item id="paste" disabled={!clipboard}><ClipboardPaste />Paste</Menu.Item>
        </>}
        {place !== "root" && <>
            <Menu.Separator />
            <Menu.Item id="duplicate"><CopyPlus />Duplicate</Menu.Item>
            <Menu.Item id="copy"><Copy />Copy</Menu.Item>
            <Menu.Item id="cut"><Scissors />Cut</Menu.Item>
        </>}
        <Menu.Separator />
        {place === "shelf"
            ? <Menu.Item id="unshelve"><ArchiveX />Take off the shelf</Menu.Item>
            : <Menu.Item id="shelve"><Archive />Keep on the shelf</Menu.Item>}
        <Menu.Item id="copy-path"><Link />Copy path</Menu.Item>
        {place !== "root" && <>
            <Menu.Separator />
            <Menu.Item id="trash" color="danger"><Trash2 />Move to Trash</Menu.Item>
        </>}
    </Menu>
}
