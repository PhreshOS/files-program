import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { context } from "@phreshos/client"
import { useDesktopViewport, useSystemAppearance } from "@phreshos/react"
import { Button, DropdownMenu, Menu, ScrollArea, Tree, useDragAndDrop } from "@phreshos/react-ui"
import { ChevronDown, Pin, PinOff, SquareArrowOutUpRight } from "@phreshos/react-ui/icons"
import FileIcon, { type FolderMark } from "./file-icon"
import { sortEntries, type Entry } from "./entries"
import { existing, followFolders, homePath, listFolder } from "./files-server"
import Shelf from "./shelf"
import { bring, dragItems, dropInto, dropOperation, type Transfer } from "./transfer"

/** How wide the panel is, and how much of it stays on the screen while it waits. */
const width = 300
const edgeWidth = 6

/** How long the pointer rests on the edge before the panel opens, and how long it may be away before it closes. */
const openDelay = 150
const closeDelay = 400

/** How long a drag is held at the edge before the panel opens for it: the Desktop's own hold. */
const dragHold = 800

type Side = "left" | "right"

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
 * beyond that edge with only a thin strip left on the screen, which catches the pointer; opening
 * slides it in whole, with the Desktop's Surface behind it. It keeps its width either way, so the
 * motion only moves it. It follows the Desktop when it changes, without motion.
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
        const presentation = moving ? context.presentation.transaction() : context.presentation
        void Promise.all([presentation.setGeometry(geometry), presentation.setSurface(open)])
    }, [open, side, size.width, size.height, spacing, taskbar.position, taskbar.size, taskbar.overlay])
}

/**
 * Whether the panel is open: the pointer resting on the edge opens it, leaving it closes it after a
 * moment, and a drag held there opens it too. Pinned, it stays open.
 */
function useOpening(pinned: boolean, side: Side) {
    const [open, setOpen] = useState(pinned)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const later = (next: boolean, delay: number) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setOpen(next), delay)
    }
    const onEnter = useEffectEvent(() => later(true, openDelay))
    // The pointer that leaves toward the screen edge is in the spacing beside the panel, still at the
    // edge that opened it: the panel stays.
    const onLeave = useEffectEvent((event: PointerEvent) => {
        const towardEdge = side === "left" ? event.clientX <= 0 : event.clientX >= window.innerWidth - 1
        if (!pinned && !towardEdge) later(false, closeDelay)
    })
    const onDrag = useEffectEvent(() => {
        // A drag keeps repeating `dragover` while it stays; the hold starts with the first one.
        if (!open && timer.current === undefined) timer.current = setTimeout(() => { timer.current = undefined; setOpen(true) }, dragHold)
    })

    // Unpinned while the pointer is already elsewhere, it closes as if the pointer had just left.
    useEffect(() => {
        clearTimeout(timer.current)
        if (pinned) setOpen(true)
        else if (!document.documentElement.matches(":hover")) later(false, closeDelay)
    }, [pinned])

    useEffect(() => {
        const root = document.documentElement
        const enter = () => onEnter()
        const leave = (event: PointerEvent) => onLeave(event)
        const drag = () => onDrag()
        root.addEventListener("pointerenter", enter)
        root.addEventListener("pointerleave", leave)
        root.addEventListener("dragover", drag)
        return () => {
            root.removeEventListener("pointerenter", enter)
            root.removeEventListener("pointerleave", leave)
            root.removeEventListener("dragover", drag)
            clearTimeout(timer.current)
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

/** Opens an entry in a Files window of its own: a folder shows its entries, a file shows itself. */
async function openInFiles(path: string, name: string) {
    const program = await context.program()
    await program.createProcess({ client: { title: name }, options: { path } })
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
    const [found, setFound] = useState<readonly string[]>([])
    const [root, setRoot] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<readonly string[]>([])
    useEffect(() => { void homePath().then(path => { setHome(path); setRoot(current => current ?? path) }) }, [])
    const places = useMemo(() => home ? placesOf(home) : [], [home])
    useEffect(() => { if (places.length) void existing(places.map(place => place.path)).then(setFound) }, [places])

    const folders = useMemo(() => root ? [root, ...expanded] : [], [root, expanded])
    const listings = useListings(folders)
    const entries = new Map([...listings.values()].flat().map(entry => [entry.path, entry]))
    const place = places.find(item => item.path === root)
    const rootName = place?.name ?? root?.slice(root.lastIndexOf("/") + 1) ?? "Files"

    const transfer: Transfer = (incoming, into, operation) => void bring(incoming, into, operation).catch(() => undefined)
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

    function renderFolder(path: string): React.ReactNode {
        return (listings.get(path) ?? []).map(entry => <Tree.Item key={entry.path} id={entry.path} textValue={entry.name} expandable={entry.kind === "folder"}>
            <Tree.Content><FileIcon kind={entry.kind} mark={places.find(item => item.path === entry.path)?.mark} size={16} />{entry.name}</Tree.Content>
            {entry.kind === "folder" && expanded.includes(entry.path) && renderFolder(entry.path)}
        </Tree.Item>)
    }

    return <nav aria-label="Files" className={open ? "panel" : "panel panel-waiting"}>
        <div className="panel-header">
            <DropdownMenu>
                <DropdownMenu.Trigger depth="none" size="small" style={{ minWidth: 0, flexShrink: 1 }} aria-label={`${rootName}, change folder`}>
                    <FileIcon kind="folder" mark={place?.mark} size={16} /><span className="panel-root">{rootName}</span><ChevronDown />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                    <Menu aria-label="Show a folder" size="small" onAction={key => { setRoot(String(key)); setExpanded([]) }}>
                        {places.filter(item => found.includes(item.path)).map(item => <Menu.Item key={item.path} id={item.path}>
                            <FileIcon kind="folder" mark={item.mark} />{item.name}
                        </Menu.Item>)}
                        <Menu.Item id="/"><FileIcon kind="drive" />Root</Menu.Item>
                    </Menu>
                </DropdownMenu.Content>
            </DropdownMenu>
            <span className="panel-spacer" />
            <Button iconOnly depth="none" size="xsmall" aria-label="Open in Files" onPress={() => root && void openInFiles(root, rootName)}><SquareArrowOutUpRight /></Button>
            <Button iconOnly depth="none" size="xsmall" aria-label={pinned ? "Unpin" : "Keep open"} aria-pressed={pinned} onPress={() => setPinned(!pinned)}>{pinned ? <PinOff /> : <Pin />}</Button>
        </div>
        <ScrollArea className="panel-tree">
            {root && <Tree aria-label={rootName} size="small" expanded={expanded} onExpandedChange={setExpanded} onAction={act} dragAndDropHooks={dragAndDropHooks}>
                {renderFolder(root)}
            </Tree>}
        </ScrollArea>
        <Shelf onOpen={entry => void openInFiles(entry.path, entry.name)} />
    </nav>
}
