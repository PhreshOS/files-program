import { context, system } from "@phreshos/client"
import { Menu } from "@phreshos/react-ui"
import { Wallpaper } from "@phreshos/react-ui/icons"
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

type Place = "desktopWallpaper" | "signInWallpaper"
type Theme = "light" | "dark"
const places: readonly Readonly<{ id: Place, name: string }>[] = [{ id: "desktopWallpaper", name: "Desktop" }, { id: "signInWallpaper", name: "Sign-in screen" }]
const themes: readonly Readonly<{ id: Theme, name: string }>[] = [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }]

/**
 * "Set as wallpaper", an Item that opens where the file becomes the wallpaper. Use it inside a Menu.
 */
export default function WallpaperSubmenu({ entry }: Readonly<{ entry: Entry }>) {
    return <Menu.Submenu>
        <Menu.Item id="wallpaper"><Wallpaper />Set as wallpaper</Menu.Item>
        <Menu.Submenu.Content><WallpaperMenu entry={entry} /></Menu.Submenu.Content>
    </Menu.Submenu>
}

/** Where the file becomes the wallpaper: the Desktop or the sign-in screen, in the light theme or the dark one. Choosing sets it at once. */
export function WallpaperMenu({ entry }: Readonly<{ entry: Entry }>) {
    return <Menu aria-label="Where it appears" size="small" onAction={key => {
        const [place, theme] = String(key).split(":")
        void setWallpaper(entry, place as Place, theme as Theme)
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
    await system.appearance.update(place === "desktopWallpaper" ? { desktopWallpaper: { [theme]: upload.file } } : { signInWallpaper: { [theme]: upload.file } })
}
