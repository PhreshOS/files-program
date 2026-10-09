import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { context } from "@phreshos/client"
import { useDesktopViewport, useSystemAppearance } from "@phreshos/react"
import { Button, ContextMenu, DropdownMenu, Loading, Menu, ScrollArea, Spinner, Tree, useDragAndDrop } from "@phreshos/react-ui"
import { ChevronDown, Pin, PinOff, SquareArrowOutUpRight } from "@phreshos/react-ui/icons"
import FileIcon, { type FolderMark } from "./file-icon"
import { sortEntries, type Entry } from "./entries"
import { existing, followClipboard, followFolders, homePath, listFolder, type Clipboard } from "./files-server"
import EntryMenu, { type MenuPlace } from "./panel-menu"
import { Arrival } from "./readiness"
import Shelf from "./shelf"
import { declaredWidth, openFilesWindow } from "./windows"
import { useWork } from "./work"
import { bring, dragItems, dropInto, dropOperation, type Transfer } from "./transfer"

/** How wide the panel is, and how much of it stays on the screen while it waits. */
const width = 300
const edgeWidth = 6

/** How long the pointer, carrying something or not, rests on the edge before the panel opens; leaving it closes it at once. */
const openDelay = 150

type Side = "left" | "right"

/** How many entries of a folder the tree shows at first, and how many more each time. */
const part = 100

/** Where the folder the tree shows is remembered, in the Program's store. */
const rootKey = "panel.root"

type Place = Readonly<{ path: string, name: string, mark: FolderMark }>

const placesOf = (home: string): readonly Place[] => [
    { path: home, name: "Home", mark: "home" },
    { path: `${home}/Desktop`, name: "Desktop", mark: "desktop" },
    { path: `${home}/Documents`, name: "Documents", mark: "documents" },
    { path: `${home}/Downloads`, name: "Downloads", mark: "downloads" },
    { path: `${home}/Pictures`, name: "Pictures", mark: "pictures" },
    { path: `${home}/Music`, name: "Music", mark: "music" },
    { path: `${home}/Videos`, name: "Videos", mark: "videos" },
    { path: `${home}/Movies`, name: "Movies", mark: "videos" }
]

/**
 * Where the panel stands: on the edge the Taskbar does not use, as tall as the space Windows get,
 * at the Appearance spacing from the edge like everything else on the Desktop. Waiting, it lies
 * beyond that edge with only a thin strip left on the screen, which catches the pointer, and with no
 * Surface, so the strip is not seen; opening slides it in whole, with the Desktop's Surface behind
 * it. It keeps its width either way, so the motion only moves it. It follows the Desktop when it
 * changes, without motion.
 */
function usePanelPlacement(open: boolean, side: Side) {
    const { size } = useDesktopViewport()
    const { spacing, taskbar } = useSystemAppearance()
    const shown = useRef<boolean | null>(null)

    useEffect(() => {
        const inset = { top: spacing, bottom: spacing }
        if (!taskbar.overlay && (taskbar.position === "top" || taskbar.position === "bottom")) inset[taskbar.position] += taskbar.size + spacing
        // Positions count from the Desktop's center; open, it stands the spacing away from the edge.
        const away = open ? spacing : edgeWidth - width
        const x = side === "left" ? -size.width / 2 + away : size.width / 2 - away - width
        const geometry = { x, y: inset.top - size.height / 2, width, height: size.height - inset.top - inset.bottom }
        const moving = shown.current !== null && shown.current !== open
        shown.current = open
        // Only the position slides. The Surface is there the moment the panel sets off to open, and
        // gone the moment it has arrived out of sight, both at once: it never fades on the way.
        if (open) void context.presentation.setSurface(true)
        const arrived = moving ? context.presentation.transactionAndWait().setGeometry(geometry) : context.presentation.setGeometry(geometry)
        if (!open) void arrived.then(() => { if (shown.current === false) return context.presentation.setSurface(false) })
    }, [open, side, size.width, size.height, spacing, taskbar.position, taskbar.size, taskbar.overlay])
}

/**
 * Whether the panel is open: the pointer reaching the edge opens it after a moment, carrying
 * something or not, so a drag can bring entries to the panel; leaving closes it at once. Pinned, it
 * stays open.
 */
function useOpening(pinned: boolean, side: Side) {
    const [open, setOpen] = useState(pinned)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const cancel = () => {
        clearTimeout(timer.current)
        timer.current = undefined
    }
    // A drag enters every element it crosses; the moment starts with the first entry only.
    const onEnter = useEffectEvent(() => {
        if (open || timer.current !== undefined) return
        timer.current = setTimeout(() => {
            timer.current = undefined
            setOpen(true)
        }, openDelay)
    })
    // The pointer that leaves toward the screen edge is in the spacing beside the panel, still at the
    // edge that opened it: the panel stays.
    const onLeave = useEffectEvent((event: MouseEvent) => {
        cancel()
        const towardEdge = side === "left" ? event.clientX <= 0 : event.clientX >= window.innerWidth - 1
        if (!pinned && !towardEdge) setOpen(false)
    })

    // Unpinned while the pointer is already elsewhere, it closes as if the pointer had just left.
    useEffect(() => {
        cancel()
        if (pinned) setOpen(true)
        else if (!document.documentElement.matches(":hover")) setOpen(false)
    }, [pinned])

    useEffect(() => {
        const root = document.documentElement
        const enter = () => onEnter()
        const leave = (event: MouseEvent) => onLeave(event)
        // A drag leaves the panel only when it goes outside it, not from one element to another.
        const dragLeave = (event: DragEvent) => { if (event.relatedTarget === null) onLeave(event) }
        root.addEventListener("pointerenter", enter)
        root.addEventListener("pointerleave", leave)
        root.addEventListener("dragenter", enter)
        root.addEventListener("dragleave", dragLeave)
        return () => {
            root.removeEventListener("pointerenter", enter)
            root.removeEventListener("pointerleave", leave)
            root.removeEventListener("dragenter", enter)
            root.removeEventListener("dragleave", dragLeave)
            cancel()
        }
    }, [])

    return open
}

/** The entries of the root and of every open folder, listed again whenever one changes. */
function useListings(folders: readonly string[]) {
    const [listings, setListings] = useState<ReadonlyMap<string, readonly Entry[]>>(new Map())
    const load = (path: string) => void listFolder(path).then(
        entries => setListings(current => new Map(current).set(path, sortEntries(entries.filter(entry => !entry.name.startsWith(".")), "name", "ascending"))),
        () => setListings(current => new Map(current).set(path, []))
    )
    useEffect(() => { for (const path of folders) if (!listings.has(path)) load(path) }, [folders, listings])
    const follow = useEffectEvent((path: string) => { if (listings.has(path)) load(path) })
    useEffect(() => followFolders(path => follow(path)), [])
    return listings
}


/**
 * Files at the edge of the screen: one folder as a tree, the way a code editor shows its project.
 * Folders open in place; a file opens in a Files window. Entries drag out of the tree and into its
 * folders, as in every Files window. Below it, the shelf keeps entries at hand.
 */
export default function Panel() {
    const [pinned, setPinned] = useState(false)
    // The panel keeps to the edge the Taskbar does not use.
    const side: Side = useSystemAppearance().taskbar.position === "left" ? "right" : "left"
    const open = useOpening(pinned, side)
    usePanelPlacement(open, side)

    const [home, setHome] = useState<string | null>(null)
    const [found, setFound] = useState<readonly string[] | null>(null)
    const [root, setRoot] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<readonly string[]>([])
    // The folder the tree shows is remembered, so the panel opens on it again, even after the System restarts.
    function showFolder(path: string) {
        setRoot(path)
        setExpanded([])
        void context.program().then(program => program.store.set(rootKey, path))
    }
    useEffect(() => {
        void (async () => {
            const program = await context.program()
            const [path, remembered] = await Promise.all([homePath(), program.store.get<string>(rootKey)])
            // A remembered folder that is gone gives way to the home folder.
            const found = remembered ? await existing([remembered]).catch(() => []) : []
            setHome(path)
            setRoot(found.includes(remembered!) ? remembered! : path)
        })()
    }, [])
    const places = useMemo(() => home ? placesOf(home) : [], [home])
    useEffect(() => { if (places.length) void existing(places.map(place => place.path)).then(setFound) }, [places])

    const folders = useMemo(() => root ? [root, ...expanded] : [], [root, expanded])
    const listings = useListings(folders)
    const entries = new Map([...listings.values()].flat().map(entry => [entry.path, entry]))
    const place = places.find(item => item.path === root)
    const rootName = place?.name ?? root?.slice(root.lastIndexOf("/") + 1) ?? "Files"

    // The entry a right press was on; on no entry, the folder the tree shows.
    const [clipboard, setClipboard] = useState<Clipboard | undefined>(undefined)
    useEffect(() => followClipboard(setClipboard), [])
    const [menuFor, setMenuFor] = useState<Readonly<{ entry: Entry, place: MenuPlace }> | null>(null)
    function menuUnder(target: EventTarget) {
        const row = target instanceof Element ? target.closest("[role=row][data-key]") : null
        const entry = row && entries.get(row.getAttribute("data-key")!)
        if (entry) setMenuFor({ entry, place: "tree" })
        else if (root) setMenuFor({ entry: { path: root, name: rootName, kind: "folder", modified: 0 }, place: "root" })
    }
    // A folder pressed twice becomes the one the tree shows.
    function showFolderUnder(target: EventTarget) {
        const row = target instanceof Element ? target.closest("[role=row][data-key]") : null
        const entry = row && entries.get(row.getAttribute("data-key")!)
        if (entry?.kind !== "folder") return
        showFolder(entry.path)
    }
    // A Files window opens beside the panel as it is drawn, on the plane the owner is looking at: the
    // drawing counts from the Desktop's center, windows from the plane's zero.
    const { offset } = useDesktopViewport()
    const { spacing } = useSystemAppearance()
    async function openInFiles(path: string, name: string) {
        const [drawn, drawnSize] = await Promise.all([context.presentation.position(), context.presentation.size()])
        // On the right, the window ends beside the panel, so its width must be known.
        const windowWidth = side === "right" ? await declaredWidth() : 0
        const x = windowWidth === null ? null : side === "left" ? drawn.x + drawnSize.width + spacing : drawn.x - spacing - windowWidth
        await openFilesWindow(path, name, x === null ? null : { x: offset.x + x, y: offset.y + drawn.y })
    }
    const openEntry = (entry: Entry) => void openInFiles(entry.path, entry.name).catch(error => console.error("Files could not open", entry.path, error))

    // What goes to the Server shows beside the folder until it settles.
    const { doing, work } = useWork()
    const transfer: Transfer = (incoming, into, operation) => work(operation === "copy" ? "Copying…" : "Moving…", () => bring(incoming, into, operation))
    const { dragAndDropHooks } = useDragAndDrop({
        getItems: keys => dragItems([...keys].map(String)),
        getAllowedDropOperations: () => ["move", "copy"],
        shouldAcceptItemDrop: target => entries.get(String(target.key))?.kind === "folder",
        getDropOperation: (target, types, allowed) => target.type === "item" && entries.get(String(target.key))?.kind !== "folder" ? "cancel" : dropOperation(types, allowed),
        onItemDrop: event => void dropInto(event.items, String(event.target.key), event.dropOperation, transfer),
        onRootDrop: event => { if (root) void dropInto(event.items, root, event.dropOperation, transfer) },
        // A drag held over a folder opens it.
        onDropActivate: ({ target }) => {
            if (target.type !== "item") return
            const path = String(target.key)
            setExpanded(current => current.includes(path) ? current : [...current, path])
        }
    })

    function act(path: string) {
        const entry = entries.get(path)
        if (!entry) return
        if (entry.kind === "folder") setExpanded(current => current.includes(path) ? current.filter(item => item !== path) : [...current, path])
        else void openInFiles(entry.path, entry.name)
    }

    // A long folder shows its entries in parts, more each time scrolling nears the last one shown.
    const [shown, setShown] = useState<ReadonlyMap<string, number>>(new Map())
    const showMore = (path: string) => setShown(current => new Map(current).set(path, (current.get(path) ?? part) + part))

    function renderFolder(path: string): React.ReactNode {
        const entries = listings.get(path) ?? []
        const count = shown.get(path) ?? part
        return <>
            {entries.slice(0, count).map(entry => {
                // A folder read and found empty has nothing to open; one opened and still being read says so.
                const listed = listings.get(entry.path)
                const reading = entry.kind === "folder" && expanded.includes(entry.path) && !listed
                return <Tree.Item key={entry.path} id={entry.path} textValue={entry.name} expandable={entry.kind === "folder" && listed?.length !== 0}>
                    <Tree.Content>
                        <FileIcon kind={entry.kind} mark={places.find(item => item.path === entry.path)?.mark} size={16} />{entry.name}
                        {reading && <Spinner size="small" label={`Reading ${entry.name}`} />}
                    </Tree.Content>
                    {entry.kind === "folder" && expanded.includes(entry.path) && renderFolder(entry.path)}
                </Tree.Item>
            })}
            {entries.length > count && <Tree.LoadMore onLoadMore={() => showMore(path)} />}
        </>
    }

    // The panel shows once its folder, the places, the clipboard, and the shelf have arrived.
    return <nav aria-label="Files" className={open ? "panel" : "panel panel-waiting"}><Loading>
        <Arrival arrived={root !== null && listings.has(root) && found !== null && clipboard !== undefined} />
        <div className="panel-header">
            <DropdownMenu>
                <DropdownMenu.Trigger depth="none" size="small" style={{ minWidth: 0, flexShrink: 1 }} aria-label={`${rootName}, change folder`}>
                    <FileIcon kind="folder" mark={place?.mark} size={16} /><span className="panel-root">{rootName}</span><ChevronDown />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                    <Menu aria-label="Show a folder" size="small" onAction={key => showFolder(String(key))}>
                        {places.filter(item => found?.includes(item.path)).map(item => <Menu.Item key={item.path} id={item.path}>
                            <FileIcon kind="folder" mark={item.mark} />{item.name}
                        </Menu.Item>)}
                        <Menu.Item id="/"><FileIcon kind="drive" />Root</Menu.Item>
                    </Menu>
                </DropdownMenu.Content>
            </DropdownMenu>
            <span className="panel-spacer" />
            {doing && <Spinner size="small" label={doing} />}
            <Button iconOnly depth="none" size="xsmall" aria-label="Open in Files" onPress={() => root && void openInFiles(root, rootName)}><SquareArrowOutUpRight /></Button>
            <Button iconOnly depth="none" size="xsmall" aria-label={pinned ? "Unpin" : "Keep open"} aria-pressed={pinned} onPress={() => setPinned(!pinned)}>{pinned ? <PinOff /> : <Pin />}</Button>
        </div>
        <ContextMenu>
            <ContextMenu.Trigger>
                <ScrollArea className="panel-tree" onContextMenuCapture={event => menuUnder(event.target)} onDoubleClick={event => showFolderUnder(event.target)}>
                    {/* A folder chosen for the tree shows once it has been read. */}
                    {root && (listings.has(root)
                        ? <Tree aria-label={rootName} size="small" expanded={expanded} onExpandedChange={setExpanded} onAction={act} dragAndDropHooks={dragAndDropHooks}>
                            {renderFolder(root)}
                        </Tree>
                        : <div className="panel-reading"><Spinner size="small" label={`Reading ${rootName}`} /></div>)}
                </ScrollArea>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                {menuFor && <EntryMenu entry={menuFor.entry} place={menuFor.place} clipboard={clipboard ?? null} onOpen={openEntry} work={work} />}
            </ContextMenu.Content>
        </ContextMenu>
        <Shelf clipboard={clipboard ?? null} onOpen={openEntry} work={work} />
    </Loading></nav>
}
