import { useEffect, useState, type CSSProperties, type DragEvent } from "react"
import { Button, ContextMenu, Menu, Surface, Tree, useAppearance, useDragAndDrop, useThemedValue } from "@phreshos/react-ui"
import { ListX, X } from "@phreshos/react-ui/icons"
import FileIcon from "./file-icon"
import type { Entry } from "./entries"
import { followShelf, shelfFolder, shelve, unshelve, type Clipboard } from "./files-server"
import EntryMenu from "./panel-menu"
import { useFirstArrival } from "./readiness"
import { bring, dragItems, entriesType, fromDataTransfer } from "./transfer"

/**
 * The shelf at the bottom of the panel: entries kept at hand while they travel between places.
 * Entries of this machine stay where they are, and the shelf only points at them; files from the
 * device are written into the shelf's own folder. Its whole container takes what is dropped on it,
 * and everything on it drags out again, into any Files window or folder.
 */
export default function Shelf({ clipboard, onOpen }: Readonly<{ clipboard: Clipboard, onOpen: (entry: Entry) => void }>) {
    const [held, setHeld] = useState<readonly Entry[] | null>(null)
    useEffect(() => followShelf(setHeld), [])
    useFirstArrival(held !== null)
    const entries = held ?? []

    const { dragAndDropHooks } = useDragAndDrop({
        getItems: keys => dragItems([...keys].map(String)),
        getAllowedDropOperations: () => ["move", "copy"]
    })

    // Putting on the shelf moves nothing: the entry is only kept at hand, so the drop is a copy.
    const [over, setOver] = useState(false)
    const accepts = (event: DragEvent) => event.dataTransfer.types.includes(entriesType) || event.dataTransfer.types.includes("Files")
    function dragOver(event: DragEvent) {
        setOver(accepts(event))
        if (!accepts(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
    }
    function dragLeave(event: DragEvent) {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setOver(false)
    }
    function drop(event: DragEvent) {
        setOver(false)
        const incoming = fromDataTransfer(event.dataTransfer)
        if (!incoming) return
        event.preventDefault()
        if ("paths" in incoming) void shelve(incoming.paths)
        else void shelfFolder().then(folder => bring(incoming, folder, "copy")).then(shelve).catch(() => undefined)
    }

    // The entry a right press was on; on the empty shelf, the shelf itself.
    const [menuFor, setMenuFor] = useState<Entry | null>(null)
    function menuUnder(target: EventTarget) {
        const row = target instanceof Element ? target.closest("[role=row][data-key]") : null
        setMenuFor(entries.find(entry => entry.path === row?.getAttribute("data-key")) ?? null)
    }

    const colors = useThemedValue(useAppearance().colors)
    return <ContextMenu>
        <ContextMenu.Trigger>
            {/* A well pressed into the panel, in the default color and the extended material. */}
            <Surface as="section" aria-label="Shelf" depth="recessed" material="extended" className={`shelf${over ? " drop-target" : ""}`}
                style={{ "--accent": colors.primary } as CSSProperties}
                onContextMenuCapture={event => menuUnder(event.target)}
                onDragOverCapture={dragOver} onDragLeave={dragLeave} onDropCapture={drop}>
                {entries.length
                    ? <Tree aria-label="Shelf" size="small" dragAndDropHooks={dragAndDropHooks}
                        onAction={key => { const entry = entries.find(item => item.path === key); if (entry) onOpen(entry) }}>
                        {entries.map(entry => <Tree.Item key={entry.path} id={entry.path} textValue={entry.name}>
                            <Tree.Content>
                                <FileIcon kind={entry.kind} size={16} /><span className="shelf-name">{entry.name}</span>
                                <Button iconOnly depth="none" size="xsmall" className="shelf-remove" aria-label={`Take ${entry.name} off the shelf`} onPress={() => void unshelve([entry.path])}><X /></Button>
                            </Tree.Content>
                        </Tree.Item>)}
                    </Tree>
                    : <p className="shelf-empty">Drop files here to keep them at hand.</p>}
            </Surface>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
            {menuFor
                ? <EntryMenu entry={menuFor} place="shelf" clipboard={clipboard} onOpen={onOpen} />
                : <Menu aria-label="Shelf" size="small" onAction={() => void unshelve(entries.map(entry => entry.path))}>
                    <Menu.Item id="clear" disabled={!entries.length}><ListX />Clear the shelf</Menu.Item>
                </Menu>}
        </ContextMenu.Content>
    </ContextMenu>
}
