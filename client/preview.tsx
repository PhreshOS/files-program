import { lazy, Suspense, useEffect, useState } from "react"
import { ProgressBar } from "@phreshos/react-ui"
import FileIcon from "./file-icon"
import { formatModified, formatSize, kindNames, type Entry } from "./entries"
import { readFile } from "./folders"

// The text view carries CodeMirror, so it loads only when a text file is shown.
const TextView = lazy(() => import("./text-view"))

/** Text and code show their beginning; media is read whole up to a limit. */
const textLimit = 4_000_000
const mediaLimit = 64_000_000

const mediaTypes: Readonly<Record<string, string>> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4",
    pdf: "application/pdf"
}

function extension(name: string) {
    const dot = name.lastIndexOf(".")
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

type Loaded =
    | Readonly<{ state: "loading" }>
    | Readonly<{ state: "text", text: string, truncated: boolean }>
    | Readonly<{ state: "media", url: string, type: string }>
    | Readonly<{ state: "none", reason: string }>

/** One file as it looks: the picture, the sound, the moving image, or the beginning of its text. */
export default function Preview({ entry }: Readonly<{ entry: Entry }>) {
    const loaded = useContent(entry)
    return <div className="preview">
        <div className="preview-content">
            {loaded.state === "loading" && <Loading name={entry.name} />}
            {loaded.state === "text" && <Suspense fallback={<Loading name={entry.name} />}><TextView name={entry.name} text={loaded.text} /></Suspense>}
            {loaded.state === "media" && <Media url={loaded.url} type={loaded.type} name={entry.name} />}
            {loaded.state === "none" && <div className="preview-none"><FileIcon kind={entry.kind} size={72} /><span>{loaded.reason}</span></div>}
        </div>
        <div className="preview-details">
            <span>{kindNames[entry.kind]}</span>
            {entry.size !== undefined && <span>{formatSize(entry.size)}</span>}
            <span>{formatModified(entry.modified)}</span>
            {loaded.state === "text" && loaded.truncated && <span>Showing the first {formatSize(textLimit)}</span>}
            <span className="preview-path" title={entry.path}><span dir="ltr">{entry.path}</span></span>
        </div>
    </div>
}

function Media({ url, type, name }: Readonly<{ url: string, type: string, name: string }>) {
    if (type.startsWith("image/")) return <img className="preview-media" src={url} alt={name} />
    if (type.startsWith("video/")) return <video className="preview-media" src={url} controls />
    if (type.startsWith("audio/")) return <audio src={url} controls />
    return <iframe className="preview-document" src={url} title={name} />
}

function useContent(entry: Entry): Loaded {
    const [loaded, setLoaded] = useState<Loaded & { path?: string }>({ state: "loading" })
    useEffect(() => {
        let current = true, url: string | undefined
        const path = entry.path
        const type = mediaTypes[extension(entry.name)]
        const show = (next: Loaded) => { if (current) setLoaded({ ...next, path }) }
        if (type && (entry.size ?? 0) > mediaLimit) { show({ state: "none", reason: `This file is too large to preview (${formatSize(entry.size)}).` }); return }
        show({ state: "loading" })
        void (async () => {
            if (type) {
                const content = await readFile(path)
                url = URL.createObjectURL(new Blob([content.bytes as Uint8Array<ArrayBuffer>], { type }))
                return show({ state: "media", url, type })
            }
            // Text by its name, or any other file whose beginning reads as text, such as a README
            // or a log without an extension.
            const known = entry.kind === "text" || entry.kind === "code"
            if (!known && !readsAsText((await readFile(path, sniffLength)).bytes)) return show({ state: "none", reason: "Files cannot show this kind of file yet." })
            const content = await readFile(path, textLimit)
            show({ state: "text", text: new TextDecoder().decode(content.bytes), truncated: content.size > content.bytes.length })
        })().catch(error => show({ state: "none", reason: `Files could not read this file. ${error instanceof Error ? error.message : ""}` }))
        return () => { current = false; if (url) URL.revokeObjectURL(url) }
    }, [entry.path, entry.name, entry.kind, entry.size])
    return loaded.path === entry.path ? loaded : { state: "loading" }
}

/** How much of an unknown file is read to tell whether it is text. */
const sniffLength = 8_192

/** Text has no zero bytes and decodes as UTF-8; an empty file counts as text. */
function readsAsText(bytes: Uint8Array) {
    if (bytes.includes(0)) return false
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, trimmedToCharacter(bytes)))
        return true
    }
    catch {
        return false
    }
}

/** The length up to the last complete UTF-8 character, since the sample may cut one in half. */
function trimmedToCharacter(bytes: Uint8Array) {
    let end = bytes.length
    let back = 0
    while (end - back - 1 >= 0 && back < 3 && (bytes[end - back - 1]! & 0xc0) === 0x80) back++
    const lead = bytes[end - back - 1]
    if (lead !== undefined && lead >= 0xc0) {
        const needed = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : 1
        if (back < needed) return end - back - 1
    }
    return end
}

function Loading({ name }: Readonly<{ name: string }>) {
    return <div className="preview-loading"><ProgressBar aria-label={`Opening ${name}`} indeterminate /></div>
}
