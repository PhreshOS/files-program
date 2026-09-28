import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AppLayout, Breadcrumbs, Button, ContextMenu, DropdownMenu, GridList, ScrollArea, Surface, useAppearance, usePreferences, Menu, ProgressBar, SearchField, SegmentedControl, Table, Toolbar, Tree, type TableSort } from "@phreshos/react-ui"
import { context } from "@phreshos/client"
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ClipboardPaste, PanelLeft, Copy, FolderOpen, FolderPlus, PencilLine, Scissors, SquareArrowOutUpRight, Trash2, Wallpaper, LayoutGrid, List } from "@phreshos/react-ui/icons"
import FileIcon, { type FolderMark } from "./file-icon"
import Preview from "./preview"
import WallpaperDialog, { wallpaperType } from "./wallpaper"
import { formatModified, formatSize, kindNames, parentOf, sortEntries, type Entry } from "./entries"
import { existing, listFolder } from "./folders"

type View = "list" | "grid"

/** Where the window is: a folder, or a file shown in place of the folder's entries. */
type Place = Readonly<{ path: string, file: Entry | null }>

type Location = Readonly<{ at: Place, back: readonly Place[], forward: readonly Place[] }>

// The usual folders are folders like any other, marked with what they hold, so a folder added to
// Favorites later sits among them as an equal.
const placesOf = (home: string): readonly Readonly<{ path: string, name: string, mark: FolderMark }>[] => [
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
 * The Files window: places on the side; the way back, the path, search, and the view above; the
 * folder's entries, or one file itself, in the content; and what they add up to below. There is one
 * place to move through: opening a file goes to it, as opening a folder does.
 */
export default function Files({ home, start }: Readonly<{ home: string, start: Entry | null }>) {
    const [location, setLocation] = useState<Location>(() => ({
        at: start ? { path: start.path, file: start.kind === "folder" ? null : start } : { path: home, file: null },
        back: [],
        forward: []
    }))
    const [view, setView] = useState<View>("list")
    const [query, setQuery] = useState("")
    const [selected, setSelected] = useState<readonly string[] | "all">([])
    const [sort, setSort] = useState<TableSort>({ column: "name", direction: "ascending" })
    const [showHidden, setShowHidden] = useState(false)
    const [wallpaper, setWallpaper] = useState<Entry | null>(null)

    const places = usePlaces(home)
    // The usual folders keep their marks wherever they appear, in the list as in Favorites.
    const marks = useMemo(() => new Map(placesOf(home).map(item => [item.path, item.mark])), [home])
    const { at } = location
    const folder = useFolder(at.file ? parentOf(at.path)! : at.path)
    const all = folder.entries
    // Names starting with a dot are hidden, as on every system these files come from.
    const hidden = all.filter(entry => entry.name.startsWith(".")).length
    const entries = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const shown = showHidden ? all : all.filter(entry => !entry.name.startsWith("."))
        return sortEntries(needle ? shown.filter(entry => entry.name.toLowerCase().includes(needle)) : shown, sort.column, sort.direction)
    }, [all, query, sort, showHidden])
    const chosen = selected === "all" ? entries : entries.filter(entry => selected.includes(entry.path))

    function go(path: string, file: Entry | null = null) {
        if (path === at.path) return
        setLocation({ at: { path, file }, back: [...location.back, at], forward: [] })
        setSelected([]); setQuery("")
    }
    function back() {
        const place = location.back.at(-1)
        if (place === undefined) return
        setLocation({ at: place, back: location.back.slice(0, -1), forward: [at, ...location.forward] })
        setSelected([]); setQuery("")
    }
    function forward() {
        const [place, ...rest] = location.forward
        if (place === undefined) return
        setLocation({ at: place, back: [...location.back, at], forward: rest })
        setSelected([]); setQuery("")
    }
    /** Opening goes to the entry: a folder shows its entries, a file shows itself. */
    function open(path: string) {
        const entry = all.find(item => item.path === path)
        if (entry) go(path, entry.kind === "folder" ? null : entry)
    }

    /** A right-click on an entry outside the selection chooses that entry, so the menu acts on it. */
    function selectUnder(target: EventTarget) {
        const path = target instanceof Element ? target.closest("[role=row][data-key]")?.getAttribute("data-key") : null
        if (path && selected !== "all" && !selected.includes(path)) setSelected([path])
    }

    const parent = parentOf(at.path)
    const place = places.find(item => item.path === at.path)?.path ?? (at.path === "/" ? "/" : null)

    const narrow = useNarrow()
    const [drawer, setDrawer] = useState(false)
    // A place chosen from the drawer also closes it.
    const choose = (path: string | null) => { if (path) go(path); setDrawer(false) }
    const placesNav = <Places places={places} place={place} onChoose={choose} />

    // The space between the files and the footer is kept after the files too, and below the footer.
    // A narrow window gives the places up to the files and keeps them one press away, in a drawer.
    return <AppLayout sidebarWidth={narrow ? 0 : undefined} style={{ paddingInlineEnd: "0.625rem", paddingBottom: "0.625rem", ...(narrow ? { columnGap: 0, paddingInlineStart: "0.625rem" } : {}) }}>
        {!narrow && <AppLayout.Title style={{ fontSize: "1.125rem", paddingInline: "0.875rem" }}>Files</AppLayout.Title>}
        {!narrow && <AppLayout.Sidebar aria-label="Places">{placesNav}</AppLayout.Sidebar>}
        <AppLayout.Header style={{ gap: "0.75rem", paddingInline: "0.375rem", marginBottom: "0.375rem" }}>
            <Toolbar aria-label="Navigation" gap="xsmall">
                {narrow && <Button iconOnly depth="flat" size="small" aria-label="Places" aria-expanded={drawer} onPress={() => setDrawer(!drawer)}><PanelLeft /></Button>}
                <Button iconOnly depth="flat" size="small" aria-label="Back" disabled={!location.back.length} onPress={back}><ArrowLeft /></Button>
                <Button iconOnly depth="flat" size="small" aria-label="Forward" disabled={!location.forward.length} onPress={forward}><ArrowRight /></Button>
                <Button iconOnly depth="flat" size="small" aria-label="Up" disabled={parent === null} onPress={() => parent && go(parent)}><ArrowUp /></Button>
            </Toolbar>
            <Path path={at.path} home={home} narrow={narrow} marks={marks} onGo={path => go(path)} />
            <div className="search"><SearchField aria-label="Search this folder" placeholder="Search" size="small" value={query} onChange={setQuery} disabled={at.file !== null} /></div>
            <div className="view"><SegmentedControl aria-label="View" size="small" disabled={at.file !== null} value={view} onChange={value => setView(value as View)}>
                <SegmentedControl.Item id="list" aria-label="List"><List /></SegmentedControl.Item>
                <SegmentedControl.Item id="grid" aria-label="Icons"><LayoutGrid /></SegmentedControl.Item>
            </SegmentedControl></div>
        </AppLayout.Header>
        <AppLayout.Content style={{ containerType: "size" }}>
            {at.file ? <FileView file={at.file} /> : <ContextMenu>
                <ContextMenu.Trigger>
                    <div className="entries" onContextMenuCapture={event => selectUnder(event.target)}>
                        {view === "list"
                            ? <ListView entries={entries} problem={folder.problem} loading={folder.loading ?? false} selected={selected} onSelect={setSelected} sort={sort} onSort={setSort} onOpen={open} query={query} marks={marks} />
                            : <GridView entries={entries} problem={folder.problem} loading={folder.loading ?? false} selected={selected} onSelect={setSelected} onOpen={open} query={query} marks={marks} />}
                    </div>
                </ContextMenu.Trigger>
                <ContextMenu.Content>
                    <Menu aria-label="Entries" size="small" onAction={action => {
                        if (chosen.length !== 1) return
                        if (action === "open") open(chosen[0]!.path)
                        if (action === "window") void openWindow(chosen[0]!)
                        if (action === "wallpaper") setWallpaper(chosen[0]!)
                    }}>
                        <Menu.Item id="open" disabled={chosen.length !== 1}><FolderOpen />Open</Menu.Item>
                        <Menu.Item id="window" disabled={chosen.length !== 1}><SquareArrowOutUpRight />Open in new window</Menu.Item>
                        {chosen.length === 1 && wallpaperType(chosen[0]!) && <Menu.Item id="wallpaper"><Wallpaper />Set as wallpaper…</Menu.Item>}
                        <Menu.Separator />
                        <Menu.Item id="new-folder" disabled><FolderPlus />New folder</Menu.Item>
                        <Menu.Item id="rename" disabled><PencilLine />Rename</Menu.Item>
                        <Menu.Item id="copy" disabled><Copy />Copy</Menu.Item>
                        <Menu.Item id="cut" disabled><Scissors />Cut</Menu.Item>
                        <Menu.Item id="paste" disabled><ClipboardPaste />Paste</Menu.Item>
                        <Menu.Separator />
                        <Menu.Item id="delete" color="danger" disabled><Trash2 />Delete</Menu.Item>
                    </Menu>
                </ContextMenu.Content>
            </ContextMenu>}
        </AppLayout.Content>
        {narrow && <Drawer open={drawer} onClose={() => setDrawer(false)}>{placesNav}</Drawer>}
        <WallpaperDialog entry={wallpaper} onClose={() => setWallpaper(null)} />
        <AppLayout.Footer style={{ paddingInline: "0.75rem 0.375rem", paddingTop: "0.625rem" }}>
            {at.file ? <>
            {wallpaperType(at.file) && <Button depth="none" size="xsmall" onPress={() => setWallpaper(at.file)}><Wallpaper />Set as wallpaper…</Button>}
            <Button depth="none" size="xsmall" onPress={() => void openWindow(at.file!)}><SquareArrowOutUpRight />Open in new window</Button>
            </> : <>
            <span className="status">{summary(entries, chosen)}</span>
            {hidden > 0 && <Button depth="none" size="xsmall" onPress={() => setShowHidden(!showHidden)}>
                {showHidden ? `Hide ${hidden} hidden` : `Show ${hidden} hidden`}
            </Button>}
            </>}
        </AppLayout.Footer>
    </AppLayout>
}

/**
 * The path as steps: every folder above is a step back to it. In a narrow window only the current
 * step shows, and it opens a menu of the ones above it.
 */
function Path({ path, home, narrow, marks, onGo }: Readonly<{ path: string, home: string, narrow: boolean, marks: ReadonlyMap<string, FolderMark>, onGo: (path: string) => void }>) {
    const parts = path === "/" ? [] : path.slice(1).split("/")
    const steps = [{ path: "/", name: "Root" }, ...parts.map((name, index) => ({ path: `/${parts.slice(0, index + 1).join("/")}`, name }))]
    // Inside the home folder, the path starts there.
    const start = path === home || path.startsWith(`${home}/`) ? steps.findIndex(step => step.path === home) : 0
    const all = steps.slice(start).map(step => step.path === home ? { ...step, name: "Home" } : step)
    const above = all.slice(0, -1)

    // Narrow, the current step itself is a quiet button that opens the folders above.
    if (narrow && above.length > 0) return <div className="path">
        <DropdownMenu>
            <DropdownMenu.Trigger depth="none" size="small" style={{ maxWidth: "100%", flexShrink: 1 }} aria-label={`${all.at(-1)!.name}, folders above`}><span className="path-current">{all.at(-1)!.name}</span><ChevronDown /></DropdownMenu.Trigger>
            <DropdownMenu.Content>
                <Menu aria-label="Folders above" size="small" onAction={key => onGo(String(key))}>
                    {[...above].reverse().map(step => <Menu.Item key={step.path} id={step.path}>
                        <FileIcon kind={step.path === "/" ? "drive" : "folder"} mark={marks.get(step.path)} />{step.name}
                    </Menu.Item>)}
                </Menu>
            </DropdownMenu.Content>
        </DropdownMenu>
    </div>

    return <div className="path">
        <Breadcrumbs size="small" style={{ flexWrap: "nowrap", minWidth: 0 }} onAction={key => onGo(String(key))}>
            {all.map(step => <Breadcrumbs.Item key={step.path} id={step.path}>{step.name}</Breadcrumbs.Item>)}
        </Breadcrumbs>
    </div>
}

type CollectionProps = Readonly<{
    marks: ReadonlyMap<string, FolderMark>
    entries: readonly Entry[]
    selected: readonly string[] | "all"
    onSelect: (value: readonly string[] | "all") => void
    onOpen: (path: string) => void
    query: string
    problem: string | null
    loading: boolean
}>

function ListView({ marks, entries, selected, onSelect, sort, onSort, onOpen, query, problem, loading }: CollectionProps & Readonly<{ sort: TableSort, onSort: (sort: TableSort) => void }>) {
    return <ScrollArea axis="horizontal"><div className="list-columns"><Table aria-label="Entries" size="small" selectionMode="multiple" value={selected} onChange={onSelect} onAction={onOpen} sort={sort} onSortChange={onSort}>
        <Table.Header>
            <Table.Column id="name" rowHeader sortable>Name</Table.Column>
            <Table.Column id="modified" sortable>Modified</Table.Column>
            <Table.Column id="size" sortable>Size</Table.Column>
            <Table.Column id="kind" sortable>Kind</Table.Column>
        </Table.Header>
        <Table.Body items={entries.map(entry => ({ ...entry, id: entry.path }))} renderEmptyState={() => <Empty query={query} problem={problem} loading={loading} />}>
            {entry => <Table.Row id={entry.path}>
                <Table.Cell><span className="name"><FileIcon kind={entry.kind} mark={marks.get(entry.path)} />{entry.name}</span></Table.Cell>
                <Table.Cell><span className="quiet">{formatModified(entry.modified)}</span></Table.Cell>
                <Table.Cell><span className="quiet numeric">{formatSize(entry.size)}</span></Table.Cell>
                <Table.Cell><span className="quiet">{kindNames[entry.kind]}</span></Table.Cell>
            </Table.Row>}
        </Table.Body>
    </Table></div></ScrollArea>
}

function GridView({ marks, entries, selected, onSelect, onOpen, query, problem, loading }: CollectionProps) {
    if (!entries.length) return <Empty query={query} problem={problem} loading={loading} />
    return <GridList aria-label="Entries" selectionMode="multiple" itemWidth="6.5rem" value={selected} onChange={onSelect} onAction={key => onOpen(String(key))}>
        {entries.map(entry => <GridList.Item key={entry.path} id={entry.path} textValue={entry.name}>
            <span className="tile"><FileIcon kind={entry.kind} mark={marks.get(entry.path)} size={48} /><span className="tile-name">{entry.name}</span></span>
        </GridList.Item>)}
    </GridList>
}

function Empty({ query, problem, loading }: Readonly<{ query: string, problem: string | null, loading: boolean }>) {
    // A slow folder shows a moving bar; a quick one never flashes it.
    if (loading) return <div className="empty loading"><ProgressBar aria-label="Opening the folder" indeterminate /></div>
    return <div className="empty">{problem ?? (query.trim() ? `Nothing here matches “${query.trim()}”.` : "This folder is empty.")}</div>
}

function summary(entries: readonly Entry[], chosen: readonly Entry[]) {
    const count = (n: number) => `${n} ${n === 1 ? "item" : "items"}`
    if (!chosen.length) return count(entries.length)
    const bytes = chosen.reduce((total, entry) => total + (entry.size ?? 0), 0)
    return `${chosen.length} of ${count(entries.length)} selected${bytes ? ` · ${formatSize(bytes)}` : ""}`
}

type Folder = Readonly<{ path: string, entries: readonly Entry[], problem: string | null, loading?: boolean }>

/** One folder's entries as the machine has them. */
function useFolder(path: string): Folder {
    const [folder, setFolder] = useState<Folder>({ path, entries: [], problem: null })
    useEffect(() => {
        let current = true
        listFolder(path).then(
            entries => current && setFolder({ path, entries, problem: null }),
            error => current && setFolder({ path, entries: [], problem: problemOf(error) })
        )
        return () => { current = false }
    }, [path])
    // Until the new folder arrives, it shows nothing of the one before.
    return folder.path === path ? folder : { path, entries: [], problem: null, loading: true }
}

function problemOf(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/EACCES|EPERM|permission/i.test(message)) return "Files cannot open this folder: the machine does not allow it."
    if (/ENOENT|not exist/i.test(message)) return "This folder no longer exists."
    return `Files could not open this folder. ${message}`
}

/** The usual folders of a home, those this machine has. */
function usePlaces(home: string) {
    const all = useMemo(() => placesOf(home), [home])
    const [found, setFound] = useState<readonly string[]>([home])
    useEffect(() => { void existing(all.map(place => place.path)).then(setFound) }, [all])
    return all.filter(place => found.includes(place.path))
}

/**
 * Opens a folder or a file in a Files window of its own: a Process with only a Client, told where
 * to start by its options. Like every Files window, it reads through the one Files Server.
 */
async function openWindow(entry: Entry) {
    const program = await context.program()
    await program.createProcess({ client: { title: entry.name }, options: { path: entry.path } })
}

/**
 * A file in the content, fitted to it: the content is a size container, and the view takes its
 * height, so the file never scrolls away. Around the file it keeps the same space as between the file
 * and its line of details, instead of the content's wider padding.
 */
function FileView({ file }: Readonly<{ file: Entry }>) {
    const ref = useRef<HTMLDivElement>(null)
    const [padding, setPadding] = useState(0)
    useLayoutEffect(() => {
        const parent = ref.current?.parentElement
        if (parent) setPadding(parseFloat(getComputedStyle(parent).paddingTop))
    }, [])
    return <div ref={ref} className="file-view" style={{ margin: `calc(var(--file-gap) - ${padding}px)`, height: "calc(100cqh - 2 * var(--file-gap))" }}>
        <Preview entry={file} />
    </div>
}

function Places({ places, place, onChoose }: Readonly<{ places: ReturnType<typeof usePlaces>, place: string | null, onChoose: (path: string | null) => void }>) {
    return <nav aria-label="Places" className="places">
        <div className="places-heading">Favorites</div>
        <Tree aria-label="Favorites" selectionMode="single" value={place} onChange={onChoose}>
            {places.map(item => <Tree.Item key={item.path} id={item.path} textValue={item.name}>
                <Tree.Content><FileIcon kind="folder" mark={item.mark} size={18} />{item.name}</Tree.Content>
            </Tree.Item>)}
        </Tree>
        <div className="places-heading">This machine</div>
        <Tree aria-label="This machine" selectionMode="single" value={place} onChange={onChoose}>
            <Tree.Item id="/" textValue="Root"><Tree.Content><FileIcon kind="drive" size={18} />Root</Tree.Content></Tree.Item>
        </Tree>
    </nav>
}

/** Narrow enough that the places would crowd the files out. */
function useNarrow() {
    const query = "(max-width: 640px)"
    const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
    useEffect(() => {
        const media = matchMedia(query)
        const follow = () => setNarrow(media.matches)
        media.addEventListener("change", follow)
        return () => media.removeEventListener("change", follow)
    }, [])
    return narrow
}

/**
 * The places over the files, from the side; a press outside or Escape closes them. It slides in and
 * back out along the same path, timed by the Appearance transaction; without motion it simply shows
 * and goes.
 */
function Drawer({ open, children, onClose }: Readonly<{ open: boolean, children: React.ReactNode, onClose: () => void }>) {
    const { animations } = usePreferences()
    const { transaction } = useAppearance()
    // It stays while it slides out, and leaves once the slide ends.
    const [present, setPresent] = useState(open)
    useEffect(() => { if (open) setPresent(true); else if (!animations) setPresent(false) }, [open, animations])
    useEffect(() => {
        if (!open) return
        const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
        addEventListener("keydown", close)
        return () => removeEventListener("keydown", close)
    }, [open, onClose])
    if (!present) return null

    const easing = typeof transaction.easing === "string" ? transaction.easing : `cubic-bezier(${transaction.easing.join(", ")})`
    const motion = animations ? { animationDuration: `${transaction.duration}ms`, animationTimingFunction: easing } : undefined
    return <>
        {open && <div className="drawer-scrim" onPointerDown={onClose} />}
        <Surface className={`drawer${animations ? open ? " drawer-opening" : " drawer-closing" : ""}`} material="full" style={motion}
            onAnimationEnd={() => { if (!open) setPresent(false) }}>
            <div className="drawer-title">Files</div>
            {children}
        </Surface>
    </>
}
