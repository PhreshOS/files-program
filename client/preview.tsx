import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { ScrollArea, Spinner, useAppearance, useThemedValue } from "@phreshos/react-ui"
import { marked } from "marked"
import FileIcon from "./file-icon"
import { extensionOf, formatModified, formatSize, kindNames, mediaTypeOf, type Entry } from "./entries"
import { readFile, saveFile } from "./files-server"

// The text view carries CodeMirror, so it loads only when a text file is shown.
const TextView = lazy(() => import("./text-view"))

/** Text and code show their beginning; media is read whole up to a limit. */
const textLimit = 4_000_000
const mediaLimit = 64_000_000

/**
 * Files that are written as text and read as something else, a page or a picture, show either way:
 * as they look, or as their code.
 */
const rendered: Readonly<Record<string, "markdown" | "page" | "picture">> = { md: "markdown", markdown: "markdown", html: "page", htm: "page", svg: "picture" }

export type FileMode = "preview" | "code"

/** Whether a file shows both as it looks and as its code. */
export function showsBothWays(entry: Entry) {
    return entry.kind !== "folder" && extensionOf(entry.name) in rendered
}

type Loaded =
    | Readonly<{ state: "loading" }>
    | Readonly<{ state: "text", text: string, truncated: boolean, url?: string }>
    | Readonly<{ state: "media", url: string, type: string }>
    | Readonly<{ state: "none", reason: string }>

/**
 * One file as it looks: the picture, the sound, the moving image, or the beginning of its text. A
 * file written as text and read as a page or a picture shows as it looks, or as its code.
 */
export default function Preview({ entry, mode }: Readonly<{ entry: Entry, mode: FileMode }>) {
    const loaded = useContent(entry)
    const form = rendered[extensionOf(entry.name)]
    return <div className="preview">
        <div className="preview-content">
            {loaded.state === "loading" && <Loading name={entry.name} />}
            {loaded.state === "text" && (form && mode === "preview"
                ? form === "picture" ? <Media url={loaded.url!} type="image/svg+xml" name={entry.name} /> : <Page text={loaded.text} form={form} name={entry.name} />
                // What is shown whole can be edited and saved; only a beginning could not be saved.
                : <Suspense fallback={<Loading name={entry.name} />}><TextView name={entry.name} text={loaded.text}
                    save={loaded.truncated ? undefined : text => saveFile(entry.path, text)} /></Suspense>)}
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

/**
 * A page or a Markdown document as it reads, in a frame of its own. A page may run its scripts there,
 * but it has no origin, so it reaches nothing of Files or the Desktop, and it scrolls itself. Markdown
 * runs no scripts and its links open outside; its frame is as tall as the document, and Files scrolls
 * it the way it scrolls everything else.
 */
function Page({ text, form, name }: Readonly<{ text: string, form: "markdown" | "page", name: string }>) {
    const colors = useThemedValue(useAppearance().colors)
    const document = useMemo(() => form === "page" ? text : `<!doctype html><meta charset="utf-8"><base target="_blank"><style>
        :root { color-scheme: light dark; overflow: hidden; }
        body { margin: 0 auto; max-width: 46rem; padding: 1.5rem 1.75rem 3rem; color: ${colors.foreground}; background: transparent; font: 0.9375rem/1.65 system-ui, sans-serif; overflow-wrap: anywhere; }
        h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.6em; }
        h1 { font-size: 1.75rem; } h2 { font-size: 1.375rem; } h3 { font-size: 1.125rem; }
        body > :first-child { margin-top: 0; }
        a { color: ${colors.primary}; }
        code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; }
        code { padding: 0.1em 0.35em; border-radius: 0.3rem; background: color-mix(in oklab, ${colors.foreground} 8%, transparent); }
        pre { padding: 0.9rem 1rem; border-radius: 0.5rem; overflow: auto; background: color-mix(in oklab, ${colors.foreground} 6%, transparent); }
        pre code { padding: 0; background: none; }
        blockquote { margin: 1em 0; padding: 0 1em; border-inline-start: 3px solid color-mix(in oklab, ${colors.foreground} 20%, transparent); opacity: 0.8; }
        table { border-collapse: collapse; } th, td { padding: 0.35rem 0.7rem; border: 1px solid color-mix(in oklab, ${colors.foreground} 15%, transparent); }
        img { max-width: 100%; }
        hr { border: 0; border-top: 1px solid color-mix(in oklab, ${colors.foreground} 15%, transparent); }
    </style>${marked.parse(text, { async: false })}`, [text, form, colors])
    if (form === "page") return <iframe className="preview-document" title={name} srcDoc={document} sandbox="allow-scripts" />
    return <Document document={document} name={name} />
}

/**
 * A document that runs no scripts, in a frame as tall as its content, which grows as its pictures
 * arrive. Files may read the frame's height because nothing runs inside it.
 */
function Document({ document, name }: Readonly<{ document: string, name: string }>) {
    const frame = useRef<HTMLIFrameElement>(null)
    const [height, setHeight] = useState(0)
    useEffect(() => {
        const element = frame.current!
        let observer: ResizeObserver | undefined
        const measure = () => {
            const root = element.contentDocument?.documentElement
            if (!root) return
            observer?.disconnect()
            observer = new ResizeObserver(() => setHeight(root.scrollHeight))
            observer.observe(root)
        }
        element.addEventListener("load", measure)
        return () => {
            element.removeEventListener("load", measure)
            observer?.disconnect()
        }
    }, [])
    return <ScrollArea className="preview-scroll">
        <iframe ref={frame} className="preview-document" title={name} srcDoc={document} style={{ height }}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
    </ScrollArea>
}

function useContent(entry: Entry): Loaded {
    const [loaded, setLoaded] = useState<Loaded & { path?: string }>({ state: "loading" })
    useEffect(() => {
        let current = true, url: string | undefined
        const path = entry.path
        const type = mediaTypeOf(entry.name)
        const show = (next: Loaded) => { if (current) setLoaded({ ...next, path }) }
        if (type && (entry.size ?? 0) > mediaLimit) { show({ state: "none", reason: `This file is too large to preview (${formatSize(entry.size)}).` }); return }
        // The same file read again, such as after a save, keeps showing until its new text arrives.
        setLoaded(previous => previous.path === path ? previous : { state: "loading", path })
        void (async () => {
            // A file that shows both ways is read as text; a picture among them also gets its address.
            if (extensionOf(entry.name) in rendered) {
                const content = await readFile(path, textLimit)
                if (type) url = URL.createObjectURL(new Blob([content.bytes as Uint8Array<ArrayBuffer>], { type }))
                return show({ state: "text", text: new TextDecoder().decode(content.bytes), truncated: content.size > content.bytes.length, url })
            }
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
    return <Spinner label={`Opening ${name}`} />
}
