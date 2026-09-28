import { DesktopProvider, SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { context, desktop, system } from "@phreshos/client"
import { Button, DocumentTheme, ProgressBar, UIProvider } from "@phreshos/react-ui"
import { StrictMode, useEffect, useState } from "react"
import client from "react-dom/client"
import Files from "./files"
import { entryAt, homePath } from "./folders"
import type { Entry } from "./entries"
import "./style.css"

// Files draws into its own element: dialogs and menus open in the body beside it.
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
        <Home />
    </UIProvider>
}

function Opening() {
    return <div className="opening"><ProgressBar indeterminate label="Opening Files…" /></div>
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
