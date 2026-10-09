import { DesktopProvider, SystemProvider, useResolvedDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { context, desktop, system } from "@phreshos/client"
import { Button, DocumentTheme, Loading, UIProvider } from "@phreshos/react-ui"
import { StrictMode, useEffect, useState } from "react"
import client from "react-dom/client"
import Files from "./files"
import Panel from "./panel"
import FilesSettings from "./settings"
import { entryAt, homePath } from "./files-server"
import { useFirstArrival } from "./readiness"
import type { Entry } from "./entries"
import "./style.css"
import { openedFolder } from "./opening"

// Files draws into its own element: menus and other overlays open in the body beside it.
client.createRoot(document.getElementById("files")!).render(<StrictMode>
    <SystemProvider system={system}>
        <DesktopProvider desktop={desktop}>
            <Themed />
        </DesktopProvider>
    </SystemProvider>
</StrictMode>)

function Themed() {
    return <UIProvider appearance={useSystemAppearance()} preferences={useResolvedDesktopPreferences()}>
        <DocumentTheme />
        <View />
    </UIProvider>
}

/**
 * What this Files window shows, by its `view` option: the settings, the panel at the edge of the
 * screen, or the files themselves. Each shows once the state it opens with has arrived, so no
 * window builds itself in front of the owner; what changes afterwards changes in place.
 */
function View() {
    const [view, setView] = useState<string | null | undefined>(undefined)
    useEffect(() => { void context.options("view").then(value => setView(value ?? null)) }, [])
    if (view === undefined) return null
    // The panel covers its own box, so nothing paints on the strip it waits as.
    if (view === "panel") return <Panel />
    return <Loading>{view === "settings" ? <FilesSettings /> : <Home />}</Loading>
}

/**
 * Every Files window browses from the home folder, unless it was opened at a path: a folder opens
 * there, and a file opens showing itself, as if the window had gone to it.
 */
function Home() {
    const [start, setStart] = useState<Readonly<{ home: string, at: Entry | null }> | { problem: string }>()
    useEffect(() => {
        void (async () => {
            // A path it was given, or a folder it was opened to show.
            const [home, given, opened] = await Promise.all([homePath(), context.options("path"), context.opened()])
            const path = given ?? openedFolder(opened)
            const at = path ? await entryAt(path).catch(() => null) : null
            setStart(path && !at ? { problem: "This folder or file no longer exists, or Files cannot reach it." } : { home, at })
        })().catch(error => setStart({ problem: `Files could not reach its Server. ${error instanceof Error ? error.message : ""}` }))
    }, [])
    useFirstArrival(start !== undefined)
    if (start === undefined) return null
    if ("problem" in start) return <div className="empty"><p>{start.problem}</p><Button onPress={() => location.reload()}>Try again</Button></div>
    return <Files home={start.home} start={start.at} />
}
