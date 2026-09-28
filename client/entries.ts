/** What a file holds, read from its name; it chooses the file's icon. */
export type FileKind = "text" | "image" | "audio" | "video" | "code" | "archive" | "pdf" | "file"

export type Entry = Readonly<{
    /** The entry's absolute path, which also identifies it. */
    path: string
    name: string
    kind: FileKind | "folder"
    /** Bytes; folders have none. */
    size?: number
    modified: number
}>

const kinds: Readonly<Record<string, FileKind>> = {
    txt: "text", md: "text", log: "text", rtf: "text", csv: "text", conf: "text",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", heic: "image",
    mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", m4a: "audio",
    mp4: "video", mov: "video", mkv: "video", webm: "video",
    ts: "code", tsx: "code", js: "code", mjs: "code", json: "code", html: "code", css: "code", py: "code", sh: "code", rs: "code", go: "code", yml: "code", yaml: "code", toml: "code",
    zip: "archive", tar: "archive", gz: "archive", tgz: "archive", "7z": "archive", rar: "archive",
    pdf: "pdf"
}

export function kindOf(name: string): FileKind {
    const dot = name.lastIndexOf(".")
    return dot > 0 ? kinds[name.slice(dot + 1).toLowerCase()] ?? "file" : "file"
}

export const kindNames: Readonly<Record<Entry["kind"], string>> = {
    folder: "Folder", text: "Text", image: "Image", audio: "Audio", video: "Video", code: "Code", archive: "Archive", pdf: "PDF document", file: "File"
}

export function parentOf(path: string) {
    if (path === "/") return null
    const parent = path.slice(0, path.lastIndexOf("/"))
    return parent === "" ? "/" : parent
}

export function joinPath(folder: string, name: string) {
    return folder === "/" ? `/${name}` : `${folder}/${name}`
}

export function formatSize(size: number | undefined) {
    if (size === undefined) return ""
    if (size < 1000) return `${size} B`
    const units = ["KB", "MB", "GB", "TB"]
    let value = size / 1000, unit = 0
    while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++ }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" })

export function formatModified(time: number) {
    const date = new Date(time), now = new Date()
    return date.toDateString() === now.toDateString() ? `Today, ${timeFormat.format(date)}` : dateFormat.format(date)
}

/** Folders first, then by the chosen column. */
export function sortEntries(entries: readonly Entry[], column: string, direction: "ascending" | "descending") {
    const sign = direction === "ascending" ? 1 : -1
    const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    const compare: Record<string, (a: Entry, b: Entry) => number> = {
        name: byName,
        modified: (a, b) => a.modified - b.modified || byName(a, b),
        size: (a, b) => (a.size ?? 0) - (b.size ?? 0) || byName(a, b),
        kind: (a, b) => kindNames[a.kind].localeCompare(kindNames[b.kind]) || byName(a, b)
    }
    return [...entries].sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || sign * (compare[column] ?? byName)(a, b))
}
