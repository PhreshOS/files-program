import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import { AppLayout, Breadcrumbs, Button, ContextMenu, Drawer, DropdownMenu, GridList, Input, ScrollArea, useAppearance, useDragAndDrop, useThemedValue, Menu, ProgressBar, SearchField, SegmentedControl, Spinner, Table, Toolbar, Tree, type DragAndDropHooks, type TableSort } from "@phreshos/react-ui"
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ClipboardPaste, CodeXml, CopyPlus, Download, Eye, FilePlus, Link, PanelLeft, Plus, Copy, FolderOpen, FolderPlus, PencilLine, Scissors, Settings, SquareArrowOutUpRight, Trash2, Upload, Wallpaper, LayoutGrid, List, X } from "@phreshos/react-ui/icons"
import FileIcon, { type FolderMark } from "./file-icon"
import Preview, { showsBothWays, type FileMode } from "./preview"
import WallpaperSubmenu, { WallpaperMenu, wallpaperType } from "./wallpaper"
import { formatModified, formatSize, kindNames, parentOf, sortEntries, type Entry } from "./entries"
import { useFirstArrival } from "./readiness"
import { besideThisWindow, openFilesWindow } from "./windows"
import type { Work } from "./work"
import { copyEntries, createFile, createFolder, dismissTask, existing, fileBlob, followClipboard, followFolders, followTasks, listFolder, paste, renameEntry, setClipboard, stopTask, trashEntries, type Clipboard, type Task } from "./files-server"
import useMarquee from "./marquee"
import { openSettings } from "./settings"
import { bring, dragItems, dropInto, dropOperation, entriesType, fromDataTransfer, fromFiles, type Incoming, type Transfer } from "./transfer"

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
    const [fileMode, setFileMode] = useState<FileMode>("preview")

    const places = usePlaces(home)
    // The usual folders keep their marks wherever they appear, in the list as in Favorites.
    const marks = useMemo(() => new Map(placesOf(home).map(item => [item.path, item.mark])), [home])
    const { at } = location
    const folderPath = at.file ? parentOf(at.path)! : at.path
    const folder = useFolder(folderPath)
    useFirstArrival(!folder.loading)
    const clipboard = useClipboard()
    const [renaming, setRenaming] = useState<string | null>(null)
    const status = useStatus()
    const work: Work = (doing, change) => void status.run(doing, change)
    const upload = useRef<HTMLInputElement>(null)
    const all = folder.entries
    // Names starting with a dot are hidden, as on every system these files come from.
    const hidden = all.filter(entry => entry.name.startsWith(".")).length
    const entries = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const shown = showHidden ? all : all.filter(entry => !entry.name.startsWith("."))
        return sortEntries(needle ? shown.filter(entry => entry.name.toLowerCase().includes(needle)) : shown, sort.column, sort.direction)
    }, [all, query, sort, showHidden])
    const chosen = selected === "all" ? entries : entries.filter(entry => selected.includes(entry.path))

    /** Moving to another place starts it fresh: nothing chosen, nothing searched, nothing to report. */
    function arrive(next: Location) {
        setLocation(next)
        setSelected([]); setQuery(""); setRenaming(null); status.clear()
    }
    function go(path: string, file: Entry | null = null) {
        if (path !== at.path) arrive({ at: { path, file }, back: [...location.back, at], forward: [] })
    }
    function back() {
        const place = location.back.at(-1)
        if (place !== undefined) arrive({ at: place, back: location.back.slice(0, -1), forward: [at, ...location.forward] })
    }
    function forward() {
        const [place, ...rest] = location.forward
        if (place !== undefined) arrive({ at: place, back: [...location.back, at], forward: rest })
    }
    /** Opening goes to the entry: a folder shows its entries, a file shows itself. */
    function open(path: string) {
        const entry = all.find(item => item.path === path)
        if (entry) go(path, entry.kind === "folder" ? null : entry)
    }

    /**
     * A right-click on an entry outside the selection chooses that entry, so the menu acts on it; one
     * on the space around the entries chooses none, so the menu acts on the folder.
     */
    function selectUnder(target: EventTarget) {
        const path = target instanceof Element ? target.closest("[role=row][data-key]")?.getAttribute("data-key") : null
        if (!path) setSelected([])
        else if (selected !== "all" && !selected.includes(path)) setSelected([path])
    }

    /** Selects the entries a change made, once the folder shows them. */
    const selectMade = (paths: readonly string[] | undefined) => { if (paths?.length) setSelected(paths) }

    /**
     * Runs a change the Server keeps as a task: the places show how far it is, and why it failed, in
     * every window, so the footer stays out of it.
     */
    const asTask = <Result,>(change: () => Promise<Result>) => change().catch(() => undefined)

    /** Brings what was dropped or chosen from the device into a folder. */
    function transfer(incoming: Incoming, into: string, operation: "move" | "copy") {
        void asTask(() => bring(incoming, into, operation)).then(paths => { if (into === folderPath) selectMade(paths) })
    }

    /** What the menus, the keys, and the buttons ask of the chosen entries, or of the folder when none is. */
    function run(action: string) {
        const paths = chosen.map(entry => entry.path)
        const one = chosen.length === 1 ? chosen[0]! : null
        const create = (make: typeof createFolder) => void status.run("Creating…", () => make(folderPath)).then(created => {
            if (created) { selectMade([created.path]); setRenaming(created.path) }
        })
        switch (action) {
            case "open": if (one) open(one.path); break
            case "window": if (one) void openWindow(one); break
            case "rename": if (one) setRenaming(one.path); break
            case "new-folder": create(createFolder); break
            case "new-file": create(createFile); break
            case "upload": upload.current?.click(); break
            case "duplicate": if (paths.length) void asTask(() => copyEntries(paths, folderPath)).then(done => selectMade(done?.paths)); break
            case "copy": case "cut": if (paths.length) void status.run(null, () => setClipboard({ mode: action, paths })); break
            case "paste": if (clipboard) void asTask(() => paste(folderPath)).then(done => selectMade(done?.paths)); break
            case "trash": if (paths.length) void asTask(() => trashEntries(paths)).then(() => setSelected([])); break
            case "download": if (paths.length) void asTask(() => download(chosen)); break
            case "copy-path": void status.run(null, () => navigator.clipboard.writeText((paths.length ? paths : [folderPath]).join("\n"))); break
        }
    }

    function finishRename(entry: Entry, name: string | null) {
        setRenaming(null)
        if (name !== null && name !== entry.name) void status.run("Renaming…", () => renameEntry(entry.path, name)).then(renamed => selectMade(renamed && [renamed.path]))
    }

    /**
     * The keys every file manager knows, anywhere in the window while it shows a folder, except where
     * text is typed or read, which keeps its own keys.
     */
    function shortcut(event: KeyboardEvent) {
        if (at.file || renaming || (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]"))) return
        const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase()
        const action = command && event.shiftKey && key === "n" ? "new-folder"
            : command && key === "c" ? "copy" : command && key === "x" ? "cut" : command && key === "v" ? "paste"
            : command && key === "d" ? "duplicate"
            : (command && key === "backspace") || key === "delete" ? "trash"
            : key === "f2" ? "rename" : null
        if (!action) return
        event.preventDefault()
        run(action)
    }

    const onShortcut = useEffectEvent(shortcut)
    useEffect(() => {
        // Before the collection, which keeps the keys it receives to itself.
        const listen = (event: KeyboardEvent) => onShortcut(event)
        addEventListener("keydown", listen, true)
        return () => removeEventListener("keydown", listen, true)
    }, [])

    const entryDrag = useEntryDrag(entries, folderPath, transfer, open)
    // A drag from the space around the entries draws a box that chooses them; a press there lets go.
    const marquee = useMarquee(chosen.map(entry => entry.path), setSelected)
    // The entries cover the whole content, its padding too, so the space around them takes a
    // right-click for the folder's menu and a drop into the folder.
    const [entriesRef, contentPadding] = useContentPadding()
    const colors = useThemedValue(useAppearance().colors)
    const cut = clipboard?.mode === "cut" ? clipboard.paths : []

    const parent = parentOf(at.path)
    const place = places.find(item => item.path === at.path)?.path ?? (at.path === "/" ? "/" : null)

    const narrow = useNarrow()
    const [drawer, setDrawer] = useState(false)
    // A place chosen from the drawer also closes it.
    const goToPlace = (path: string | null) => { if (path) go(path); setDrawer(false) }
    const placesNav = <Places places={places} place={place} onChoose={goToPlace} transfer={transfer} />

    // The space between the files and the footer is kept after the files too, and below the footer.
    // A narrow window gives the places up to the files and keeps them one press away, in a drawer.
    return <AppLayout sidebarWidth={narrow ? 0 : undefined} style={{ paddingInlineEnd: "0.625rem", paddingBottom: "0.625rem", ...(narrow ? { columnGap: 0, paddingInlineStart: "0.625rem" } : {}) }}>
        {!narrow && <AppLayout.Title style={{ fontSize: "1.125rem", paddingInline: "0.875rem" }}>Files</AppLayout.Title>}
        {!narrow && <AppLayout.Sidebar aria-label="Places" footer={<SettingsEntry />}>{placesNav}</AppLayout.Sidebar>}
        <AppLayout.Header style={{ gap: "0.75rem", paddingInline: "0.375rem", marginBottom: "0.375rem" }}>
            <Toolbar aria-label="Navigation" gap="xsmall">
                {narrow && <Button iconOnly depth="flat" size="small" aria-label="Places" aria-expanded={drawer} onPress={() => setDrawer(!drawer)}><PanelLeft /></Button>}
                <Button iconOnly depth="flat" size="small" aria-label="Back" disabled={!location.back.length} onPress={back}><ArrowLeft /></Button>
                <Button iconOnly depth="flat" size="small" aria-label="Forward" disabled={!location.forward.length} onPress={forward}><ArrowRight /></Button>
                <Button iconOnly depth="flat" size="small" aria-label="Up" disabled={parent === null} onPress={() => parent && go(parent)}><ArrowUp /></Button>
            </Toolbar>
            <Path path={at.path} home={home} narrow={narrow} marks={marks} onGo={path => go(path)} />
            <DropdownMenu>
                <DropdownMenu.Trigger iconOnly depth="flat" size="small" aria-label="New" disabled={at.file !== null}><Plus /></DropdownMenu.Trigger>
                <DropdownMenu.Content>
                    <Menu aria-label="New" size="small" onAction={action => run(String(action))}><NewItems /></Menu>
                </DropdownMenu.Content>
            </DropdownMenu>
            <div className="search"><SearchField aria-label="Search this folder" placeholder="Search" size="small" value={query} onChange={setQuery} disabled={at.file !== null} /></div>
            {/* The view of what the window shows: a folder as a list or as icons; a file that shows both
                ways as it looks or as its code. */}
            <div className="view">{at.file && showsBothWays(at.file)
                ? <SegmentedControl aria-label="Show" size="small" value={fileMode} onChange={value => setFileMode(value as FileMode)}>
                    <SegmentedControl.Item id="preview" aria-label="Preview"><Eye /></SegmentedControl.Item>
                    <SegmentedControl.Item id="code" aria-label="Code"><CodeXml /></SegmentedControl.Item>
                </SegmentedControl>
                : <SegmentedControl aria-label="View" size="small" disabled={at.file !== null} value={view} onChange={value => setView(value as View)}>
                    <SegmentedControl.Item id="list" aria-label="List"><List /></SegmentedControl.Item>
                    <SegmentedControl.Item id="grid" aria-label="Icons"><LayoutGrid /></SegmentedControl.Item>
                </SegmentedControl>}</div>
        </AppLayout.Header>
        <AppLayout.Content style={{ containerType: "size" }}>
            {at.file ? <FileView file={at.file} mode={fileMode} /> : <ContextMenu>
                <ContextMenu.Trigger>
                    <div ref={entriesRef} className={`entries${entryDrag.around ? " drop-target" : ""}`}
                        style={{
                            margin: `${-contentPadding.top}px ${-contentPadding.right}px ${-contentPadding.bottom}px ${-contentPadding.left}px`,
                            padding: `${contentPadding.top}px ${contentPadding.right}px ${contentPadding.bottom}px ${contentPadding.left}px`,
                            minHeight: "100cqh",
                            // The one outline of a drop into this folder, and the box that chooses
                            // entries, take the primary color.
                            "--accent": colors.primary
                        } as CSSProperties} onContextMenuCapture={event => selectUnder(event.target)}
                        onPointerDown={marquee.onPointerDown} onPointerMove={marquee.onPointerMove} onPointerUp={marquee.onPointerUp} onPointerCancel={marquee.onPointerCancel}
                        onDragOverCapture={entryDrag.over} onDragLeave={entryDrag.leave} onDropCapture={entryDrag.drop}>
                        {view === "list"
                            ? <ListView entries={entries} problem={folder.problem} loading={folder.loading ?? false} selected={selected} onSelect={setSelected} sort={sort} onSort={setSort} onOpen={open} query={query} marks={marks} dragAndDropHooks={entryDrag.hooks} renaming={renaming} onRename={finishRename} cut={cut} />
                            : <GridView entries={entries} problem={folder.problem} loading={folder.loading ?? false} selected={selected} onSelect={setSelected} onOpen={open} query={query} marks={marks} dragAndDropHooks={entryDrag.hooks} renaming={renaming} onRename={finishRename} cut={cut} />}
                        {marquee.box && <div className="marquee" style={marquee.box} />}
                    </div>
                </ContextMenu.Trigger>
                <ContextMenu.Content>
                    {chosen.length
                        ? <Menu aria-label="Entries" size="small" onAction={action => run(String(action))}>
                            <Menu.Item id="open" disabled={chosen.length !== 1}><FolderOpen />Open</Menu.Item>
                            <Menu.Item id="window" disabled={chosen.length !== 1}><SquareArrowOutUpRight />Open in new window</Menu.Item>
                            {chosen.length === 1 && wallpaperType(chosen[0]!) && <WallpaperSubmenu entry={chosen[0]!} work={work} />}
                            <Menu.Separator />
                            <Menu.Item id="rename" disabled={chosen.length !== 1}><PencilLine />Rename</Menu.Item>
                            <Menu.Item id="duplicate"><CopyPlus />Duplicate</Menu.Item>
                            <Menu.Item id="copy"><Copy />Copy</Menu.Item>
                            <Menu.Item id="cut"><Scissors />Cut</Menu.Item>
                            <Menu.Separator />
                            <Menu.Item id="download" disabled={chosen.some(entry => entry.kind === "folder")}><Download />Download</Menu.Item>
                            <Menu.Item id="copy-path"><Link />Copy path</Menu.Item>
                            <Menu.Separator />
                            <Menu.Item id="trash" color="danger"><Trash2 />Move to Trash</Menu.Item>
                        </Menu>
                        : <Menu aria-label="This folder" size="small" onAction={action => run(String(action))}>
                            <NewItems />
                            <Menu.Separator />
                            <Menu.Item id="paste" disabled={!clipboard}><ClipboardPaste />Paste</Menu.Item>
                            <Menu.Item id="copy-path"><Link />Copy path</Menu.Item>
                        </Menu>}
                </ContextMenu.Content>
            </ContextMenu>}
            <input ref={upload} type="file" multiple hidden onChange={event => {
                const files = [...event.target.files ?? []]
                event.target.value = ""
                if (files.length) transfer(fromFiles(files), folderPath, "copy")
            }} />
        </AppLayout.Content>
        {narrow && <Drawer open={drawer} onClose={() => setDrawer(false)} title="Files" style={{ display: "flex", flexDirection: "column" }}>
            {placesNav}<div style={{ marginTop: "auto" }}><SettingsEntry /></div>
        </Drawer>}
        <AppLayout.Footer style={{ paddingInline: "0.75rem 0.375rem", paddingTop: "0.625rem" }}>
            <Tasks />
            {at.file ? <>
                {wallpaperType(at.file) && <DropdownMenu>
                    <DropdownMenu.Trigger depth="none" size="xsmall"><Wallpaper />Set as wallpaper<ChevronDown /></DropdownMenu.Trigger>
                    <DropdownMenu.Content><WallpaperMenu entry={at.file} work={work} /></DropdownMenu.Content>
                </DropdownMenu>}
                <Button depth="none" size="xsmall" onPress={() => void openWindow(at.file!)}><SquareArrowOutUpRight />Open in new window</Button>
            </> : <>
                <span className={`status${status.current?.problem ? " problem" : ""}`} role="status" style={status.current?.problem ? { color: colors.danger } : undefined}>{status.current?.text ?? summary(entries, chosen)}</span>
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
    dragAndDropHooks: DragAndDropHooks
    /** The entry whose name is being changed in place. */
    renaming: string | null
    onRename: (entry: Entry, name: string | null) => void
    /** Entries cut to be pasted elsewhere, shown faded until then. */
    cut: readonly string[]
}>

// As in every file manager, a press chooses one entry, with Command or Shift it adds more, and a
// double press opens it.
function ListView({ marks, entries, selected, onSelect, sort, onSort, onOpen, query, problem, loading, dragAndDropHooks, renaming, onRename, cut }: CollectionProps & Readonly<{ sort: TableSort, onSort: (sort: TableSort) => void }>) {
    return <ScrollArea axis="horizontal"><div className="list-columns"><Table aria-label="Entries" size="small" selectionMode="multiple" selectionBehavior="replace" value={selected} onChange={onSelect} onAction={onOpen} sort={sort} onSortChange={onSort} dragAndDropHooks={dragAndDropHooks} style={{ outline: "none" }}>
        <Table.Header>
            <Table.Column id="name" rowHeader sortable>Name</Table.Column>
            <Table.Column id="modified" sortable>Modified</Table.Column>
            <Table.Column id="size" sortable>Size</Table.Column>
            <Table.Column id="kind" sortable>Kind</Table.Column>
        </Table.Header>
        <Table.Body items={entries.map(entry => ({ ...entry, id: entry.path }))} dependencies={[renaming, cut, marks]} renderEmptyState={() => <Empty query={query} problem={problem} loading={loading} />}>
            {entry => <Table.Row id={entry.path} textValue={entry.name}>
                <Table.Cell><span className={`name${cut.includes(entry.path) ? " cut" : ""}`}><FileIcon kind={entry.kind} mark={marks.get(entry.path)} />
                    {renaming === entry.path ? <RenameField entry={entry} onDone={name => onRename(entry, name)} /> : entry.name}
                </span></Table.Cell>
                <Table.Cell><span className="quiet">{formatModified(entry.modified)}</span></Table.Cell>
                <Table.Cell><span className="quiet numeric">{formatSize(entry.size)}</span></Table.Cell>
                <Table.Cell><span className="quiet">{kindNames[entry.kind]}</span></Table.Cell>
            </Table.Row>}
        </Table.Body>
    </Table></div></ScrollArea>
}

function GridView({ marks, entries, selected, onSelect, onOpen, query, problem, loading, dragAndDropHooks, renaming, onRename, cut }: CollectionProps) {
    if (!entries.length) return <Empty query={query} problem={problem} loading={loading} />
    return <GridList aria-label="Entries" selectionMode="multiple" selectionBehavior="replace" restColor="primary:subtle" itemWidth="6.5rem" style={{ alignContent: "start", outline: "none" }} value={selected} onChange={onSelect} onAction={key => onOpen(String(key))} dragAndDropHooks={dragAndDropHooks}>
        {entries.map(entry => <GridList.Item key={entry.path} id={entry.path} textValue={entry.name}>
            <span className={`tile${cut.includes(entry.path) ? " cut" : ""}`}><FileIcon kind={entry.kind} mark={marks.get(entry.path)} size={48} />
                {renaming === entry.path ? <RenameField entry={entry} onDone={name => onRename(entry, name)} /> : <span className="tile-name">{entry.name}</span>}
            </span>
        </GridList.Item>)}
    </GridList>
}

/**
 * A new name typed in place of the old one. It starts with the name chosen up to its extension, which
 * is usually kept; Enter or leaving the field keeps the new name, Escape keeps the old one. Its keys
 * and presses stay in the field, away from the collection around it.
 */
function RenameField({ entry, onDone }: Readonly<{ entry: Entry, onDone: (name: string | null) => void }>) {
    const input = useRef<HTMLInputElement>(null)
    const [name, setName] = useState(entry.name)
    const finished = useRef(false)
    const finish = (value: string | null) => { if (!finished.current) { finished.current = true; onDone(value) } }
    useLayoutEffect(() => {
        const field = input.current
        if (!field) return
        const dot = entry.kind === "folder" ? -1 : entry.name.lastIndexOf(".")
        field.focus()
        field.setSelectionRange(0, dot > 0 ? dot : entry.name.length)
    }, [entry])
    return <span className="rename" onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
        <Input ref={input} aria-label={`New name for ${entry.name}`} size="xsmall" value={name} onChange={setName} onBlur={() => finish(name.trim() ? name : null)}
            onKeyDown={event => { if (event.key === "Enter") finish(name.trim() ? name : null); else if (event.key === "Escape") finish(null) }} />
    </span>
}

/** What can be made in a folder, in the menus that make it. */
function NewItems() {
    return <>
        <Menu.Item id="new-folder"><FolderPlus />New folder</Menu.Item>
        <Menu.Item id="new-file"><FilePlus />New text file</Menu.Item>
        <Menu.Item id="upload"><Upload />Upload files…</Menu.Item>
    </>
}

function Empty({ query, problem, loading }: Readonly<{ query: string, problem: string | null, loading: boolean }>) {
    // A slow folder shows a moving bar; a quick one never flashes it.
    if (loading) return <div className="empty loading"><Spinner label="Opening the folder" /></div>
    return <div className="empty">{problem ?? (query.trim() ? `Nothing here matches “${query.trim()}”.` : "This folder is empty.")}</div>
}

function summary(entries: readonly Entry[], chosen: readonly Entry[]) {
    const count = (n: number) => `${n} ${n === 1 ? "item" : "items"}`
    if (!chosen.length) return count(entries.length)
    const bytes = chosen.reduce((total, entry) => total + (entry.size ?? 0), 0)
    return `${chosen.length} of ${count(entries.length)} selected${bytes ? ` · ${formatSize(bytes)}` : ""}`
}

type Folder = Readonly<{ path: string, entries: readonly Entry[], problem: string | null, loading?: boolean }>

/** One folder's entries as the machine has them, listed again whenever the folder changes. */
function useFolder(path: string): Folder {
    const [folder, setFolder] = useState<Folder>({ path, entries: [], problem: null, loading: true })
    const [version, setVersion] = useState(0)
    useEffect(() => followFolders(changed => { if (changed === path) setVersion(value => value + 1) }), [path])
    useEffect(() => {
        let current = true
        listFolder(path).then(
            entries => current && setFolder({ path, entries, problem: null }),
            error => current && setFolder({ path, entries: [], problem: problemOf(error) })
        )
        return () => { current = false }
    }, [path, version])
    // Until the new folder arrives, it shows nothing of the one before; the same folder listed again
    // keeps showing until the new list replaces it.
    return folder.path === path ? folder : { path, entries: [], problem: null, loading: true }
}

/** What was copied or cut, in any Files window. */
function useClipboard() {
    const [clipboard, setClipboard] = useState<Clipboard | undefined>(undefined)
    useEffect(() => followClipboard(setClipboard), [])
    useFirstArrival(clipboard !== undefined)
    return clipboard ?? null
}

type Status = Readonly<{ text: string, problem: boolean }>

/**
 * What the footer reports about a change: what it is doing, once it takes long enough to notice, and
 * why it failed. Files reports in its own footer; the System will have its own way to notify.
 */
function useStatus() {
    const [current, setCurrent] = useState<Status | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const show = (next: Status | null, after = 0) => {
        clearTimeout(timer.current)
        if (after) timer.current = setTimeout(() => setCurrent(next), after)
        else setCurrent(next)
    }
    return {
        current,
        clear: () => show(null),
        /** Runs one change; it answers undefined when the change failed, after reporting why. */
        async run<Result>(doing: string | null, change: () => Promise<Result>): Promise<Result | undefined> {
            show(doing === null ? null : { text: doing, problem: false }, doing === null ? 0 : 400)
            try {
                const result = await change()
                show(null)
                return result
            }
            catch (error) {
                show({ text: problemOf(error, "Files could not do this."), problem: true })
                timer.current = setTimeout(() => setCurrent(null), 10_000)
                return undefined
            }
        }
    }
}

/**
 * Dragging entries: out of the collection, to another folder in it or in another Files window, and
 * into it from there or from the owner's device. The collection takes drops on its folders and on
 * itself; the space around it takes drops for the folder it shows, and a folder the drag is held over
 * opens. A drag moves entries, or copies them with the copy key held, Option on a Mac and Control
 * elsewhere; files from a device are copied.
 */
function useEntryDrag(entries: readonly Entry[], folder: string, transfer: Transfer, openFolder: (path: string) => void) {
    const folders = new Set(entries.filter(entry => entry.kind === "folder").map(entry => entry.path))
    const { dragAndDropHooks } = useDragAndDrop({
        getItems: keys => dragItems([...keys].map(String)),
        getAllowedDropOperations: () => ["move", "copy"],
        shouldAcceptItemDrop: target => folders.has(String(target.key)),
        getDropOperation: (target, types, allowed) => target.type === "item" && !folders.has(String(target.key)) ? "cancel" : dropOperation(types, allowed),
        onItemDrop: event => void dropInto(event.items, String(event.target.key), event.dropOperation, transfer),
        // A drag held over a folder opens it, so the drag can go on deeper.
        onDropActivate: event => { if (event.target.type === "item" && folders.has(String(event.target.key))) openFolder(String(event.target.key)) },
        onRootDrop: event => void dropInto(event.items, folder, event.dropOperation, transfer)
    })

    const [around, setAround] = useState(false)
    const outside = (event: DragEvent) => !(event.target instanceof Element && event.target.closest("table, [role=grid]"))
    const accepts = (event: DragEvent) => event.dataTransfer.types.includes(entriesType) || event.dataTransfer.types.includes("Files")
    const copying = (event: DragEvent) => !event.dataTransfer.types.includes(entriesType) || (/Mac/.test(navigator.platform) ? event.altKey : event.ctrlKey)

    return {
        hooks: dragAndDropHooks,
        around,
        over(event: DragEvent) {
            const takes = outside(event) && accepts(event)
            setAround(takes)
            if (!takes) return
            event.preventDefault()
            event.dataTransfer.dropEffect = copying(event) ? "copy" : "move"
        },
        leave(event: DragEvent) {
            if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setAround(false)
        },
        drop(event: DragEvent) {
            setAround(false)
            if (!outside(event)) return
            const incoming = fromDataTransfer(event.dataTransfer)
            if (!incoming) return
            event.preventDefault()
            transfer(incoming, folder, copying(event) ? "copy" : "move")
        }
    }
}

/** Saves files to the owner's device, each streamed whole from the Server first. */
async function download(files: readonly Entry[]) {
    for (const file of files) {
        const url = URL.createObjectURL(await fileBlob(file.path))
        Object.assign(document.createElement("a"), { href: url, download: file.name }).click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
}

/** Why something failed, in words: the machine's reasons by their codes, Files' own as they are. */
function problemOf(error: unknown, failed = "Files could not open this folder.") {
    const message = error instanceof Error ? error.message : String(error)
    if (/EACCES|EPERM|permission/i.test(message)) return `${failed} The machine does not allow it.`
    if (/ENOENT|not exist/i.test(message)) return `${failed} It no longer exists.`
    if (/ENOSPC/.test(message)) return `${failed} The disk is full.`
    if (/^E[A-Z]+:/.test(message)) return `${failed} ${message}`
    return message
}

/** The usual folders of a home, those this machine has. */
function usePlaces(home: string) {
    const all = useMemo(() => placesOf(home), [home])
    const [found, setFound] = useState<readonly string[] | null>(null)
    useEffect(() => { void existing(all.map(place => place.path)).then(setFound) }, [all])
    useFirstArrival(found !== null)
    return all.filter(place => (found ?? [home]).includes(place.path))
}

/** Opens a folder or a file in a Files window of its own, a little down and across from this one. */
async function openWindow(entry: Entry) {
    await openFilesWindow(entry.path, entry.name, await besideThisWindow())
}

/**
 * A file in the content, fitted to it: the content is a size container, and the view takes its
 * height, so the file never scrolls away. Around the file it keeps the same space as between the file
 * and its line of details, instead of the content's wider padding.
 */
function FileView({ file, mode }: Readonly<{ file: Entry, mode: FileMode }>) {
    const [ref, padding] = useContentPadding()
    return <div ref={ref} className="file-view" style={{ margin: `calc(var(--file-gap) - ${padding.top}px)`, height: "calc(100cqh - 2 * var(--file-gap))" }}>
        <Preview entry={file} mode={mode} />
    </div>
}

/**
 * The padding the content keeps around what it holds, for an element that covers the whole content
 * instead: the space around the entries takes presses and drops too, and a file sets its own space.
 */
function useContentPadding() {
    const [padding, setPadding] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
    // Measured whenever the element appears, such as when a file gives way to its folder again.
    const ref = useCallback((element: HTMLDivElement | null) => {
        if (!element?.parentElement) return
        const style = getComputedStyle(element.parentElement)
        const next = { top: parseFloat(style.paddingTop), right: parseFloat(style.paddingRight), bottom: parseFloat(style.paddingBottom), left: parseFloat(style.paddingLeft) }
        // A ref may be called again on every render, such as through a trigger that merges refs: only
        // a changed padding is news.
        setPadding(current => current.top === next.top && current.right === next.right && current.bottom === next.bottom && current.left === next.left ? current : next)
    }, [])
    return [ref, padding] as const
}

/**
 * The places, each a folder that takes what is dropped on it, as a folder in the list does; one
 * the drag is held over opens.
 */
function Places({ places, place, onChoose, transfer }: Readonly<{ places: ReturnType<typeof usePlaces>, place: string | null, onChoose: (path: string | null) => void, transfer: Transfer }>) {
    const favorites = usePlaceDrop(transfer, onChoose)
    const machine = usePlaceDrop(transfer, onChoose)
    return <nav aria-label="Places" className="places">
        <div className="places-heading">Favorites</div>
        <Tree aria-label="Favorites" selectionMode="single" value={place} onChange={onChoose} dragAndDropHooks={favorites}>
            {places.map(item => <Tree.Item key={item.path} id={item.path} textValue={item.name}>
                <Tree.Content><FileIcon kind="folder" mark={item.mark} size={18} />{item.name}</Tree.Content>
            </Tree.Item>)}
        </Tree>
        <div className="places-heading">This machine</div>
        <Tree aria-label="This machine" selectionMode="single" value={place} onChange={onChoose} dragAndDropHooks={machine}>
            <Tree.Item id="/" textValue="Root"><Tree.Content><FileIcon kind="drive" size={18} />Root</Tree.Content></Tree.Item>
        </Tree>
    </nav>
}

/** Files' own settings, at the foot of the places, where a program keeps them. */
function SettingsEntry() {
    return <Button depth="none" size="small" onPress={() => void openSettings()}><Settings />Settings</Button>
}

/**
 * The long operations of every Files window, in one line at the start of the footer: how far the
 * newest one is, with a way to stop it, and how many more are running. One that failed says why
 * until dismissed.
 */
function Tasks() {
    const tasks = useTasks()
    const danger = useThemedValue(useAppearance().colors).danger
    const task = tasks[0]
    if (!task) return null
    const failed = task.state === "failed"
    const detail = task.total === null ? "Measuring…" : task.unit === "bytes" ? `${formatSize(task.done)} of ${formatSize(task.total)}` : `${task.done} of ${task.total}`
    return <section aria-label="Tasks" className="task-line">
        {failed
            ? <span className="task-text" style={{ color: danger, opacity: 1 }}>{task.title}: {problemOf(new Error(task.problem ?? ""), "It could not finish.")}</span>
            : <>
                <ProgressBar aria-label={task.title} size="small" value={task.done} maxValue={task.total || 1} indeterminate={!task.total} style={{ width: "5rem", flex: "none" }} />
                <span className="task-text" title={task.title}>{task.title} · {detail}</span>
            </>}
        {tasks.length > 1 && <span className="task-text">+{tasks.length - 1} more</span>}
        {failed
            ? <Button iconOnly depth="none" size="xsmall" aria-label="Dismiss" onPress={() => void dismissTask(task.id)}><X /></Button>
            : <Button iconOnly depth="none" size="xsmall" aria-label={`Stop ${task.title}`} onPress={() => void stopTask(task.id)}><X /></Button>}
    </section>
}

/** The long operations of every Files window, as the Server announces them. */
function useTasks() {
    const [tasks, setTasks] = useState<readonly Task[] | null>(null)
    useEffect(() => followTasks(setTasks), [])
    useFirstArrival(tasks !== null)
    return tasks ?? []
}

/** Drops on places: into the place's folder, moved or copied as anywhere else. */
function usePlaceDrop(transfer: Transfer, open: (path: string) => void) {
    return useDragAndDrop({
        getDropOperation: (target, types, allowed) => target.type === "item" ? dropOperation(types, allowed) : "cancel",
        onItemDrop: event => void dropInto(event.items, String(event.target.key), event.dropOperation, transfer),
        onDropActivate: event => { if (event.target.type === "item") open(String(event.target.key)) }
    }).dragAndDropHooks
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

