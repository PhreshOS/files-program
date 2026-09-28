import { useEffect, useState } from "react"
import { context, system } from "@phreshos/client"
import { Button, Dialog, GridList, ProgressBar, useAppearance } from "@phreshos/react-ui"
import type { Entry } from "./entries"
import { readFile } from "./folders"

/** What a wallpaper may be, by the file's name, and the most the System takes. */
const wallpaperTypes: Readonly<Record<string, string>> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", ogv: "video/ogg",
    html: "text/html", htm: "text/html"
}
const wallpaperLimit = 50 * 1024 * 1024

/** The type a file would have as a wallpaper, or null when it cannot be one. */
export function wallpaperType(entry: Entry) {
    const dot = entry.name.lastIndexOf(".")
    const type = dot > 0 ? wallpaperTypes[entry.name.slice(dot + 1).toLowerCase()] : undefined
    return type && entry.kind !== "folder" && (entry.size ?? 0) <= wallpaperLimit ? type : null
}

type Place = "desktop" | "signIn"
type Theme = "light" | "dark"
const places: readonly Readonly<{ id: Place, name: string }>[] = [{ id: "desktop", name: "Desktop" }, { id: "signIn", name: "Sign-in screen" }]
const themes: readonly Readonly<{ id: Theme, name: string }>[] = [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }]

/**
 * Chooses where a file becomes the wallpaper: the Desktop or the sign-in screen, in the light theme,
 * the dark one, or any mix of the four. Setting uploads the file once and changes only those chosen.
 */
export default function WallpaperDialog({ entry, onClose }: Readonly<{ entry: Entry | null, onClose: () => void }>) {
    return <Dialog open={entry !== null} onOpenChange={open => { if (!open) onClose() }}>
        <Dialog.Backdrop dismissable>
            <Dialog.Content aria-label="Set as wallpaper" style={{ width: "min(26rem, calc(100vw - 2rem))", maxHeight: "calc(100vh - 2rem)" }}>
                {entry && <Chooser entry={entry} onDone={onClose} />}
            </Dialog.Content>
        </Dialog.Backdrop>
    </Dialog>
}

function Chooser({ entry, onDone }: Readonly<{ entry: Entry, onDone: () => void }>) {
    const type = wallpaperType(entry)!
    const { colors } = useAppearance()
    const [chosen, setChosen] = useState<readonly string[] | "all">(["desktop-light", "desktop-dark"])
    const [file, setFile] = useState<Readonly<{ bytes: Uint8Array, url: string }>>()
    const [state, setState] = useState<Readonly<{ setting: boolean, problem: string | null }>>({ setting: false, problem: null })

    // The file is read once: the cards show it, and setting uploads the same bytes.
    useEffect(() => {
        let url: string | undefined, current = true
        readFile(entry.path).then(content => {
            if (!current) return
            url = URL.createObjectURL(new Blob([content.bytes as Uint8Array<ArrayBuffer>], { type }))
            setFile({ bytes: content.bytes, url })
        }, error => current && setState({ setting: false, problem: `Files could not read this file. ${error instanceof Error ? error.message : ""}` }))
        return () => { current = false; if (url) URL.revokeObjectURL(url) }
    }, [entry.path, type])

    const selected = chosen === "all" ? places.flatMap(place => themes.map(theme => `${place.id}-${theme.id}`)) : chosen

    async function set() {
        if (!file || !selected.length) return
        setState({ setting: true, problem: null })
        try {
            for (const name of ["uploads", "appearance"] as const) {
                if (await context.permissions.allows(name)) continue
                // A granted permission comes back as its values; a refusal as false, a dismissal as null.
                if (!Array.isArray(await context.permissions.request(name))) throw new Error("Files needs your permission to set a wallpaper.")
            }
            const upload = await system.uploads.write(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type }))
            const chosenIn = (place: Place): Partial<Record<Theme, string>> => Object.fromEntries(themes.filter(theme => selected.includes(`${place}-${theme.id}`)).map(theme => [theme.id, upload.file]))
            const desktopWallpaper = chosenIn("desktop"), signInWallpaper = chosenIn("signIn")
            // Only the wallpapers chosen change; at least one was, or Set could not be pressed.
            await system.appearance.update(Object.keys(desktopWallpaper).length
                ? { desktopWallpaper, ...(Object.keys(signInWallpaper).length ? { signInWallpaper } : {}) }
                : { signInWallpaper })
            onDone()
        }
        catch (error) {
            setState({ setting: false, problem: error instanceof Error ? error.message : String(error) })
        }
    }

    return <>
        <Dialog.Header>
            <Dialog.Title>Set as wallpaper</Dialog.Title>
            <Dialog.Description>Choose where it appears.</Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
            {file === undefined && !state.problem
                ? <div className="wallpaper-loading"><ProgressBar aria-label={`Opening ${entry.name}`} indeterminate /></div>
                : <GridList aria-label="Where it appears" selectionMode="multiple" itemWidth="9rem" value={chosen} onChange={setChosen}>
                    {places.map(place => <GridList.Section key={place.id} id={place.id}>
                        <GridList.Header>{place.name}</GridList.Header>
                        {themes.map(theme => <GridList.Item key={theme.id} id={`${place.id}-${theme.id}`} textValue={`${place.name}, ${theme.name}`}>
                            <span className="wallpaper-card">
                                <span className="wallpaper-frame" style={{ background: colors[theme.id].background }}>
                                    {file && (type.startsWith("video/")
                                        ? <video src={file.url} muted autoPlay loop playsInline />
                                        : type.startsWith("image/") ? <img src={file.url} alt="" /> : <span className="wallpaper-page">Page</span>)}
                                </span>
                                <span>{theme.name}</span>
                            </span>
                        </GridList.Item>)}
                    </GridList.Section>)}
                </GridList>}
            {state.problem && <p className="wallpaper-problem">{state.problem}</p>}
        </Dialog.Body>
        <Dialog.Footer>
            <Dialog.Close>Cancel</Dialog.Close>
            <Button color="primary" pending={state.setting} disabled={!file || !selected.length} onPress={() => void set()}>Set</Button>
        </Dialog.Footer>
    </>
}
