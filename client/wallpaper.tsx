import type { AppearanceWallpaper, Theme } from "@phreshos/core"
import { context, system } from "@phreshos/client"
import { Menu } from "@phreshos/react-ui"
import { Wallpaper } from "@phreshos/react-ui/icons"
import { mediaTypeOf, type Entry } from "./entries"
import { readFile } from "./files-server"
import type { Work } from "./work"

/** What a wallpaper may be: a picture, a video the browser plays everywhere, or a page; and the most the System takes. */
const wallpaperVideos = new Set(["video/mp4", "video/webm", "video/ogg"])
const wallpaperLimit = 50 * 1024 * 1024

/** The type a file would have as a wallpaper, or null when it cannot be one. */
export function wallpaperType(entry: Entry) {
    const type = entry.kind === "folder" ? undefined : mediaTypeOf(entry.name)
    const fits = type !== undefined && (type.startsWith("image/") || wallpaperVideos.has(type) || type === "text/html")
    return fits && (entry.size ?? 0) <= wallpaperLimit ? type : null
}

type Place = keyof AppearanceWallpaper
const places: readonly Readonly<{ id: Place, name: string }>[] = [{ id: "desktop", name: "Desktop" }, { id: "signIn", name: "Sign-in screen" }]
const themes: readonly Readonly<{ id: Theme, name: string }>[] = [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }]

/**
 * "Set as wallpaper", an Item that opens where the file becomes the wallpaper. Use it inside a Menu.
 */
export default function WallpaperSubmenu({ entry, work }: Readonly<{ entry: Entry, work: Work }>) {
    return <Menu.Submenu>
        <Menu.Item id="wallpaper"><Wallpaper />Set as wallpaper</Menu.Item>
        <Menu.Submenu.Content><WallpaperMenu entry={entry} work={work} /></Menu.Submenu.Content>
    </Menu.Submenu>
}

/** Where the file becomes the wallpaper: the Desktop or the sign-in screen, in the light theme or the dark one. Choosing sets it at once. */
export function WallpaperMenu({ entry, work }: Readonly<{ entry: Entry, work: Work }>) {
    return <Menu aria-label="Where it appears" size="small" onAction={key => {
        const [place, theme] = String(key).split(":")
        work("Setting the wallpaper…", () => setWallpaper(entry, place as Place, theme as Theme))
    }}>
        {places.map(place => <Menu.Section key={place.id} id={place.id}>
            <Menu.Header>{place.name}</Menu.Header>
            {themes.map(theme => <Menu.Item key={theme.id} id={`${place.id}:${theme.id}`}>{theme.name}</Menu.Item>)}
        </Menu.Section>)}
    </Menu>
}

/** Uploads the file and changes only the wallpaper chosen. */
async function setWallpaper(entry: Entry, place: Place, theme: Theme) {
    for (const name of ["uploads", "appearance"] as const) {
        if (await context.permissions.allows(name)) continue
        // A granted permission comes back as its values; a refusal as false, a dismissal as null.
        if (!Array.isArray(await context.permissions.request(name))) return
    }
    const { bytes } = await readFile(entry.path)
    const upload = await system.uploads.write(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: wallpaperType(entry)! }))
    await system.appearance.update({ wallpaper: { [theme]: { [place]: upload.file } } })
}
