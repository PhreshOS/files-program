import { useMemo, useState } from "react"
import { opensType } from "@phreshos/core"
import { AlertDialog, AppLayout, Button, Code, Input, Text, useAppearance, useScale, type TableSort } from "@phreshos/react-ui"
import { FolderPlus } from "@phreshos/react-ui/icons"
import { openTypeOf, sortEntries, type Entry } from "./entries"
import { isRoot, join, nameAllowed } from "./paths"
import { ListView, Path, Places, placesOf, useFolder, usePlaces } from "./files"
import { answerPicker, createFolder, type PickerRequest } from "./files-server"
import { useFirstArrival } from "./readiness"

/**
 * A Files window that asks a person for another Program: to choose a file to open, a place and a name
 * to save one, or whether it may reach a path it names. It says who asks and what for; nothing reaches
 * the asker until the person answers, and cancelling, or closing the window, gives it nothing.
 */
export default function Picker({ home, folder, request }: Readonly<{ home: string, folder: string, request: PickerRequest }>) {
    return request.kind === "access" ? <Access request={request} /> : <Choose home={home} folder={folder} request={request} />
}

/** The person lets the asker reach one path it named, to read, or to read and change. */
function Access({ request }: Readonly<{ request: Extract<PickerRequest, { kind: "access" }> }>) {
    const space = useScale(useAppearance().spacing)
    const [sending, setSending] = useState(false)
    const send = (allowed: boolean) => {
        setSending(true)
        void answerPicker(request.request, allowed ? [request.path] : null).catch(() => setSending(false))
    }
    const asker = request.asker?.name ?? "A script"
    return <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100%", padding: space.large, gap: space.medium, boxSizing: "border-box" }}>
        <div style={{ display: "grid", alignContent: "center", gap: space.small }}>
            <Text>{asker} asks to {request.mode === "read" ? "read" : "read and change"}</Text>
            <Text size="small" style={{ overflowWrap: "anywhere" }}><Code>{request.path}</Code></Text>
            <Text size="small" tone="secondary">Until it closes, it can {request.mode === "read" ? "read" : "read and change"} this, and what is inside it if it is a folder.</Text>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: space.small }}>
            <Button size="small" depth="flat" disabled={sending} onPress={() => send(false)}>Deny</Button>
            <Button size="small" color="primary" disabled={sending} onPress={() => send(true)}>Allow</Button>
        </div>
    </div>
}

/** The person chooses a file to open, or a place and a name to save one. */
function Choose({ home, folder: start, request }: Readonly<{ home: string, folder: string, request: Exclude<PickerRequest, { kind: "access" }> }>) {
    const [folderPath, setFolderPath] = useState(start)
    const [selected, setSelected] = useState<readonly string[]>([])
    const [sort, setSort] = useState<TableSort>({ column: "name", direction: "ascending" })
    const [name, setName] = useState(request.kind === "save" ? request.name ?? "" : "")
    const [replacing, setReplacing] = useState<Entry | null>(null)
    const [sending, setSending] = useState(false)

    const folder = useFolder(folderPath)
    useFirstArrival(!folder.loading)
    const places = usePlaces(home)
    const marks = useMemo(() => new Map(placesOf(home).map(item => [item.path, item.mark])), [home])

    // Hidden entries stay hidden; to open, only folders and the files of the types asked for show.
    const entries = useMemo(() => sortEntries(folder.entries.filter(entry => !entry.name.startsWith(".") && (
        entry.kind === "folder" || request.kind === "save" || request.types.length === 0 || opensType(request.types, openTypeOf(entry.name))
    )), sort.column, sort.direction), [folder.entries, request, sort])
    const chosen = entries.filter(entry => selected.includes(entry.path))
    const files = chosen.filter(entry => entry.kind !== "folder")

    function go(path: string) {
        setFolderPath(path)
        setSelected([])
    }

    // One at a time unless the asker takes several: the newest choice stands alone.
    function select(value: readonly string[] | "all") {
        const all = value === "all" ? entries.map(entry => entry.path) : value
        const newest = all.find(path => !selected.includes(path)) ?? all.at(-1)
        const next = request.kind === "open" && request.multiple ? all : newest ? [newest] : []
        setSelected(next)
        // Saving, a file chosen gives its name, to save over it.
        const file = entries.find(entry => entry.path === newest && entry.kind !== "folder")
        if (request.kind === "save" && file) setName(file.name)
    }

    function send(paths: readonly string[] | null) {
        setSending(true)
        void answerPicker(request.request, paths).catch(() => setSending(false))
    }

    /** Opening an entry: a folder shows its entries; a file, when opening, is the choice itself. */
    function open(path: string) {
        const entry = entries.find(item => item.path === path)
        if (!entry) return
        if (entry.kind === "folder") go(entry.path)
        else if (request.kind === "open") send([entry.path])
        else setName(entry.name)
    }

    function save() {
        const trimmed = name.trim()
        const existing = folder.entries.find(entry => entry.name === trimmed)
        if (existing?.kind === "folder") return go(existing.path)
        if (existing) return setReplacing(existing)
        send([join(folderPath, trimmed)])
    }

    const asker = request.asker?.name ?? "A script"
    const asks = request.kind === "save" ? `${asker} asks where to save` : request.multiple ? `${asker} asks for files to open` : `${asker} asks for a file to open`
    const place = places.find(item => item.path === folderPath)?.path ?? (isRoot(folderPath) ? folderPath : null)
    const ready = request.kind === "save" ? nameAllowed(name.trim()) : files.length > 0

    return <AppLayout style={{ paddingInlineEnd: "0.625rem", paddingBottom: "0.625rem" }}>
        <AppLayout.Title style={{ fontSize: "1.125rem", paddingInline: "0.875rem" }}>{request.kind === "save" ? "Save" : "Open"}</AppLayout.Title>
        <AppLayout.Sidebar aria-label="Places"><Places places={places} place={place} onChoose={path => { if (path) go(path) }} /></AppLayout.Sidebar>
        <AppLayout.Header style={{ gap: "0.75rem", paddingInline: "0.375rem", marginBottom: "0.375rem" }}>
            <AppLayout.SidebarToggle />
            <Path path={folderPath} home={home} marks={marks} onGo={go} />
            {request.kind === "save" && <Button iconOnly depth="flat" size="small" aria-label="New folder"
                onPress={() => void createFolder(folderPath).then(created => { if (created) go(created.path) }).catch(() => undefined)}><FolderPlus /></Button>}
        </AppLayout.Header>
        <AppLayout.Content>
            <ListView entries={entries} problem={folder.problem} loading={folder.loading ?? false} selected={selected} onSelect={select}
                sort={sort} onSort={setSort} onOpen={open} query="" marks={marks} />
        </AppLayout.Content>
        <AppLayout.Footer style={{ paddingInline: "0.75rem 0.375rem", paddingTop: "0.625rem", gap: "0.5rem" }}>
            <Text size="small" tone="secondary" style={{ flex: "1 1 auto", minWidth: 0 }} truncate>{asks}</Text>
            {request.kind === "save" && <Input aria-label="Name" size="small" value={name} onChange={setName} style={{ width: "14rem" }}
                onKeyDown={event => { if (event.key === "Enter" && ready) save() }} />}
            <Button size="small" depth="flat" disabled={sending} onPress={() => send(null)}>Cancel</Button>
            <Button size="small" color="primary" disabled={!ready || sending}
                onPress={() => request.kind === "save" ? save() : send(files.map(file => file.path))}>{request.kind === "save" ? "Save" : "Open"}</Button>
        </AppLayout.Footer>
        <AlertDialog open={replacing !== null} onOpenChange={open => { if (!open) setReplacing(null) }}>
            <AlertDialog.Backdrop>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Replace “{replacing?.name}”?</AlertDialog.Title>
                        <AlertDialog.Description>A file with this name is already here. {asker} will write over it.</AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Close>Cancel</AlertDialog.Close>
                        <AlertDialog.Close color="danger" onPress={() => { if (replacing) send([replacing.path]) }}>Replace</AlertDialog.Close>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Backdrop>
        </AlertDialog>
    </AppLayout>
}
