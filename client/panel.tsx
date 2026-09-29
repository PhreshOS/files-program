import { useEffect, useMemo, useRef, useState } from "react"
import { context } from "@phreshos/client"
import { useDesktopViewport, useSystemAppearance } from "@phreshos/react"
import { Tree } from "@phreshos/react-ui"
import FileIcon, { type FolderMark } from "./file-icon"
import { existing, homePath } from "./files-server"

/** How wide the panel is. */
const width = 280

/**
 * Files at the edge of the screen, in the `over` layer, where the Desktop leaves placement to the
 * Program: it stands on the edge the Taskbar does not use, as tall as the space Windows get, and
 * follows the Desktop when it changes.
 */
function usePanelPlacement() {
    const { size } = useDesktopViewport()
    const { spacing, taskbar } = useSystemAppearance()
    const placed = useRef(false)

    useEffect(() => {
        const inset = { top: spacing, right: spacing, bottom: spacing, left: spacing }
        if (!taskbar.overlay) inset[taskbar.position] += taskbar.size + spacing
        const left = taskbar.position !== "left"
        const height = size.height - inset.top - inset.bottom
        // Positions count from the Desktop's center.
        const x = left ? inset.left - size.width / 2 : size.width / 2 - inset.right - width
        const y = inset.top - size.height / 2
        const geometry = { x, y, width, height }
        void (async () => {
            await context.presentation.setGeometry(geometry)
            if (!placed.current) {
                placed.current = true
                await context.presentation.setSurface(true)
            }
        })()
    }, [size.width, size.height, spacing, taskbar.position, taskbar.size, taskbar.overlay])
}

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

/** Opens a place in a Files window of its own, as "Open in new window" does. */
async function openPlace(path: string, name: string) {
    const program = await context.program()
    await program.createProcess({ client: { title: name }, options: { path } })
}

/** The panel of Files: the places, one press from a Files window. */
export default function Panel() {
    usePanelPlacement()
    const [home, setHome] = useState<string | null>(null)
    const [found, setFound] = useState<readonly string[]>([])
    useEffect(() => { void homePath().then(setHome) }, [])
    const places = useMemo(() => home ? placesOf(home) : [], [home])
    useEffect(() => { if (places.length) void existing(places.map(place => place.path)).then(setFound) }, [places])

    return <nav aria-label="Files" className="panel">
        <div className="panel-title">Files</div>
        <Tree aria-label="Places" onAction={path => { const place = places.find(item => item.path === path); if (place) void openPlace(place.path, place.name) }}>
            {places.filter(place => found.includes(place.path)).map(place => <Tree.Item key={place.path} id={place.path} textValue={place.name}>
                <Tree.Content><FileIcon kind="folder" mark={place.mark} size={18} />{place.name}</Tree.Content>
            </Tree.Item>)}
        </Tree>
    </nav>
}
