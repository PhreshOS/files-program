import { DesktopProvider, SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { context, desktop, system } from "@phreshos/client"
import { Button, DocumentTheme, ProgressBar, UIProvider } from "@phreshos/react-ui"
import { StrictMode, useEffect, useState } from "react"
import client from "react-dom/client"
import Files from "./files"
import Panel from "./panel"
import FilesSettings from "./settings"
import { entryAt, homePath } from "./files-server"
import type { Entry } from "./entries"
import "./style.css"

// Files draws into its own element: menus and other overlays open in the body beside it.
client.createRoot(document.getElementById("files")!).render(<StrictMode>
    <SystemProvider system={system} fallback={<Opening />}>
        <DesktopProvider desktop={desktop} fallback={<Opening />}>
            <Themed />
        </DesktopProvider>
    </SystemProvider>
</StrictMode>)

function Themed() {
    return <UIProvider appearance={useSystemAppearance()} preferences={useDesktopPreferences()}>
        <DocumentTheme />
        <View />
    </UIProvider>
}

function Opening() {
    return <div className="opening"><ProgressBar indeterminate label="Opening Files…" /></div>
}

/**
 * What this Files window shows, by its `view` option: the settings, the panel at the edge of the
 * screen, or the files themselves.
 */
function View() {
    const [view, setView] = useState<string | null | undefined>(undefined)
    useEffect(() => { void context.options("view").then(value => setView(value ?? null)) }, [])
    if (view === undefined) return <Opening />
    if (view === "settings") return <FilesSettings />
    if (view === "panel") return <Panel />
    return <Home />
}

/**
 * Every Files window browses from the home folder, unless it was opened at a path: a folder opens
 * there, and a file opens showing itself, as if the window had gone to it.
 */
function Home() {
    const [start, setStart] = useState<Readonly<{ home: string, at: Entry | null }> | { problem: string }>()
    useEffect(() => {
        void (async () => {
            const [home, path] = await Promise.all([homePath(), context.options("path")])
            const at = path ? await entryAt(path).catch(() => null) : null
            setStart(path && !at ? { problem: "This folder or file no longer exists, or Files cannot reach it." } : { home, at })
        })().catch(error => setStart({ problem: `Files could not reach its Server. ${error instanceof Error ? error.message : ""}` }))
    }, [])
    if (start === undefined) return <Opening />
    if ("problem" in start) return <div className="empty"><p>{start.problem}</p><Button onPress={() => location.reload()}>Try again</Button></div>
    return <Files home={start.home} start={start.at} />
}
