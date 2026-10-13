import { DesktopProvider, SystemProvider, useResolvedDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { context, desktop, system } from "@phreshos/client"
import { Button, DocumentTheme, Loading, UIProvider } from "@phreshos/react-ui"
import { StrictMode, useEffect, useState } from "react"
import client from "react-dom/client"
import Files from "./files"
import Panel from "./panel"
import Picker from "./picker"
import { pickerView } from "../server/launches"
import FilesSettings from "./settings"
import { entryAt, homePath, pickerRequest, type PickerRequest } from "./files-server"
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
    return <Loading>{view === "settings" ? <FilesSettings /> : view === pickerView ? <PickerHome /> : <Home />}</Loading>
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

/** A picker window, once it knows the request it was opened for and where it starts browsing. */
function PickerHome() {
    const [start, setStart] = useState<Readonly<{ home: string, request: PickerRequest, folder: string }> | { problem: string }>()
    useEffect(() => {
        void (async () => {
            const request = await context.options("request")
            if (!request) throw new Error("This window was opened for no request.")
            const [home, asked] = await Promise.all([homePath(), pickerRequest(request)])
            // It starts in the folder the asker named, while that folder is there; else at home.
            const folder = asked.kind !== "access" && asked.folder ? await entryAt(asked.folder).catch(() => null) : null
            setStart({ home, request: asked, folder: folder?.kind === "folder" ? folder.path : home })
        })().catch(error => setStart({ problem: error instanceof Error ? error.message : "Files could not reach its picker." }))
    }, [])
    useFirstArrival(start !== undefined)
    if (start === undefined) return null
    if ("problem" in start) return <div className="empty"><p>{start.problem}</p></div>
    return <Picker home={start.home} folder={start.folder} request={start.request} />
}
