import { useEffect, useState } from "react"
import { context } from "@phreshos/client"
import { Switch } from "@phreshos/react-ui"
import { useFirstArrival } from "./readiness"
import { filesService, panelLaunch, panelShown } from "../server/launches"
import { besideThisWindow } from "./windows"

/**
 * Opens the settings of Files, in one small window of their own, beside the window that asked. When
 * they are already open somewhere, they come to that window instead: beside it, shown, and in front.
 */
export async function openSettings() {
    const program = await context.program()
    const position = await besideThisWindow()
    const settings = await program.findOrCreateProcess({
        name: "settings",
        server: false,
        client: { title: "Files Settings", size: { width: 440, height: 260 }, ...(position ? { position } : {}) },
        options: { view: "settings" }
    })
    // Found already open, they come here; just opened, they already stand here.
    const { window } = settings.client
    if (position) await window.move(position)
    await window.minimize(false)
    await window.raise()
}

/** Whether the panel is on: it is running, or the Server starts it with the System. */
async function panelIsOn() {
    const program = await context.program()
    const [processes, shown] = await Promise.all([program.processes(), program.store.get<boolean>(panelShown)])
    return processes.some(process => process.name === "panel") || shown === true
}

/**
 * Turns the panel on or off, now and at the next start of the System. The Server starts it then, so
 * turning it on also has the Server start with the System again, if the owner had removed that.
 */
async function setPanel(on: boolean) {
    const program = await context.program()
    if (on) {
        // The panel stays above every window, which the owner allows first.
        if (!await context.permissions.allows("layers", ["over"])) {
            const granted = await context.permissions.request("layers", ["over"])
            if (!granted) throw new Error("Files needs your permission to show above your windows.")
        }
        await program.store.set(panelShown, true)
        await program.findOrCreateProcess(panelLaunch)
        await program.startup.set(filesService)
    }
    else {
        await program.store.set(panelShown, false)
        const panel = (await program.processes()).find(process => process.name === "panel")
        await panel?.exit()
    }
}

/** The settings of Files: one small window, one decision per line. */
export default function FilesSettings() {
    const [panel, setPanelShown] = useState<boolean | null>(null)
    const [problem, setProblem] = useState<string | null>(null)
    const [changing, setChanging] = useState(false)

    useEffect(() => { void panelIsOn().then(setPanelShown) }, [])
    useFirstArrival(panel !== null)

    async function change(on: boolean) {
        setProblem(null)
        setPanelShown(on)
        setChanging(true)
        try {
            await setPanel(on)
        }
        catch (error) {
            setPanelShown(!on)
            setProblem(error instanceof Error ? error.message : String(error))
        }
        finally {
            setChanging(false)
        }
    }

    return <main className="settings">
        <h1 className="settings-title">Settings</h1>
        <Switch checked={panel ?? false} disabled={panel === null || changing} onChange={on => void change(on)}
            label="Panel at the edge of the screen"
            description="Files waits at the edge of the screen and opens when you move the pointer there. It starts with the System while it is on." />
        {problem && <p className="settings-problem" role="alert">{problem}</p>}
    </main>
}
