import { useEffect, useState } from "react"
import { Button, Surface, Tree, useDragAndDrop } from "@phreshos/react-ui"
import { ListX, X } from "@phreshos/react-ui/icons"
import FileIcon from "./file-icon"
import type { Entry } from "./entries"
import { followShelf, shelfFolder, shelve, unshelve } from "./files-server"
import { bring, dragItems, entriesType, fromDropItems } from "./transfer"

/**
 * The shelf at the bottom of the panel: entries kept at hand while they travel between places.
 * Entries of this machine stay where they are, and the shelf only points at them; files from the
 * device are written into the shelf's own folder. Everything on it drags out again, into any Files
 * window or folder.
 */
export default function Shelf({ onOpen }: Readonly<{ onOpen: (entry: Entry) => void }>) {
    const [entries, setEntries] = useState<readonly Entry[]>([])
    useEffect(() => followShelf(setEntries), [])

    const { dragAndDropHooks } = useDragAndDrop({
        getItems: keys => dragItems([...keys].map(String)),
        getAllowedDropOperations: () => ["move", "copy"],
        // Putting on the shelf moves nothing: the entry is only kept at hand.
        getDropOperation: (target, types, allowed) => target.type === "root" && (allowed.includes("copy") || !types.has(entriesType)) ? "copy" : "cancel",
        onRootDrop: async event => {
            const incoming = await fromDropItems(event.items)
            if (!incoming) return
            if ("paths" in incoming) void shelve(incoming.paths)
            else void shelfFolder().then(folder => bring(incoming, folder, "copy")).then(shelve).catch(() => undefined)
        }
    })

    return <section aria-label="Shelf" className="shelf">
        <div className="panel-header">
            <span className="shelf-title">Shelf</span>
            <span className="panel-spacer" />
            {entries.length > 0 && <Button iconOnly depth="none" size="xsmall" aria-label="Clear the shelf" onPress={() => void unshelve(entries.map(entry => entry.path))}><ListX /></Button>}
        </div>
        {/* A well the entries rest in, pressed into the panel. */}
        <Surface depth="recessed" className="shelf-well">
            <Tree aria-label="Shelf" size="small" dragAndDropHooks={dragAndDropHooks}
                onAction={key => { const entry = entries.find(item => item.path === key); if (entry) onOpen(entry) }}
                renderEmptyState={() => <p className="shelf-empty">Drop files here to keep them at hand.</p>}>
                {entries.map(entry => <Tree.Item key={entry.path} id={entry.path} textValue={entry.name}>
                    <Tree.Content>
                        <FileIcon kind={entry.kind} size={16} /><span className="shelf-name">{entry.name}</span>
                        <Button iconOnly depth="none" size="xsmall" className="shelf-remove" aria-label={`Take ${entry.name} off the shelf`} onPress={() => void unshelve([entry.path])}><X /></Button>
                    </Tree.Content>
                </Tree.Item>)}
            </Tree>
        </Surface>
    </section>
}
