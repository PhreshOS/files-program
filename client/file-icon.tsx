import { useId } from "react"
import type { Entry, FileKind } from "./entries"

/**
 * Files' own icons. A file is an apricot leaf in its kind's color with the kind's mark; a folder is
 * a pocket holding the same leaves.
 */
/** What a well-known folder holds, drawn on its front. */
export type FolderMark = "home" | "desktop" | "documents" | "downloads" | "pictures" | "music" | "videos"

export default function FileIcon({ kind, open = false, mark, size = 16 }: Readonly<{ kind: Entry["kind"] | "drive", open?: boolean, mark?: FolderMark, size?: number }>) {
    const id = useId()
    return <svg className="file-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
            <linearGradient id={`${id}shine`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></linearGradient>
            {kind === "folder" && <>
                <linearGradient id={`${id}front`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd98f" /><stop offset="1" stopColor="#f5b55a" /></linearGradient>
                <linearGradient id={`${id}leaf`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7fd08a" /><stop offset="1" stopColor="#3f9a4e" /></linearGradient>
                <linearGradient id={`${id}leaf-light`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a6e0a0" /><stop offset="1" stopColor="#5fb96d" /></linearGradient>
            </>}
        </defs>
        {kind === "folder" ? <Folder id={id} open={open} mark={mark} /> : kind === "drive" ? <Drive id={id} /> : <Leaf id={id} kind={kind} />}
    </svg>
}

const leafBody = "M28 3.1c-.9 4.8.8 9.4-.9 14.9-2 7-8.5 10.6-15 10.1-4-.3-6.8-2.5-7.6-6-1-4.5.6-10 5.1-13.8 4.5-3.8 11-3.4 15-4.2 1.3-.2 2.4-.6 3.4-1z"

const colors: Readonly<Record<FileKind, string>> = {
    text: "#7b8ba3", image: "#2f9e6e", audio: "#8b6fe0", video: "#e0564a", code: "#3f7de0", archive: "#b8863b", pdf: "#d8483b", file: "#9aa3ae"
}

function Leaf({ id, kind }: Readonly<{ id: string, kind: FileKind }>) {
    return <>
        <path d="M6.2 26.2L3 29.4" stroke={colors[kind]} strokeWidth="1.6" strokeLinecap="round" />
        <path d={leafBody} fill={colors[kind]} />
        <path d={leafBody} fill={`url(#${id}shine)`} />
        <g transform="translate(16 16.4) scale(.72) translate(-16 -16)">{marks[kind]}</g>
    </>
}

/** A leaf as the folder holds it: smaller, turned, with its stem. */
function HeldLeaf({ x, y, scale, angle, fill }: Readonly<{ x: number, y: number, scale: number, angle: number, fill: string }>) {
    return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(-16 -16)`}>
        <path d="M6.2 26.2L3 29.4" stroke="#3f9a4e" strokeWidth="1.6" strokeLinecap="round" />
        <path d={leafBody} fill={fill} />
    </g>
}

function Folder({ id, open, mark }: Readonly<{ id: string, open: boolean, mark?: FolderMark }>) {
    return open ? <>
        <HeldLeaf x={10} y={7.8} scale={.54} angle={-22} fill={`url(#${id}leaf)`} />
        <HeldLeaf x={21.5} y={8.2} scale={.48} angle={22} fill={`url(#${id}leaf-light)`} />
        <path d="M6.3 14.6A2.2 2.2 0 0 1 8.4 13h20.3a1.4 1.4 0 0 1 1.34 1.8l-2.5 9.9A3 3 0 0 1 24.6 27H6a3 3 0 0 1-2.9-3.7z" fill={`url(#${id}front)`} />
    </> : <>
        <HeldLeaf x={10.5} y={8.8} scale={.5} angle={-12} fill={`url(#${id}leaf)`} />
        <HeldLeaf x={20.5} y={9.2} scale={.44} angle={14} fill={`url(#${id}leaf-light)`} />
        <path d="M3 13.2a2.2 2.2 0 0 1 2.2-2.2h21.6a2.2 2.2 0 0 1 2.2 2.2V24a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill={`url(#${id}front)`} />
        <path d="M5.4 11.7h21.2" stroke="#fff" strokeOpacity=".55" strokeWidth=".8" strokeLinecap="round" />
        {mark && <g fill="none" stroke="#b0702a" strokeOpacity=".85" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{folderMarks[mark]}</g>}
    </>
}

/** Marks sit on the folder's front, centered below its top edge. */
const folderMarks: Readonly<Record<FolderMark, React.ReactNode>> = {
    home: <path d="M11.5 19.6L16 15.8l4.5 3.8M13 18.5v5h6v-5" />,
    desktop: <><rect x="11" y="15.6" width="10" height="6.4" rx="1.2" /><path d="M14 24.2h4" /></>,
    documents: <path d="M12 16.4h8M12 19.4h8M12 22.4h5" />,
    downloads: <path d="M16 15.4v6M13.4 19l2.6 2.6 2.6-2.6M12 24h8" />,
    pictures: <><path d="M11 23.4l3.4-3.8 2.4 2.6 1.6-1.6 2.6 2.8" /><circle cx="18.6" cy="16.9" r="1.2" /></>,
    music: <><path d="M14.4 22.6v-6.4l5.2-1.2v6" /><circle cx="13.1" cy="22.8" r="1.3" /><circle cx="18.3" cy="21.2" r="1.3" /></>,
    videos: <path d="M14 15.8v7.2l6-3.6z" />
}

/** The machine's disk: the root of every path. */
function Drive({ id }: Readonly<{ id: string }>) {
    return <>
        <rect x="3" y="9" width="26" height="15" rx="4" fill="#9aa3ae" />
        <rect x="3" y="9" width="26" height="15" rx="4" fill={`url(#${id}shine)`} />
        <path d="M8 19.5h9" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="23.5" cy="19.5" r="1.6" fill="#7fd08a" />
    </>
}

const marks: Readonly<Record<FileKind, React.ReactNode>> = {
    // An unknown file is a seed.
    file: <><path d="M16 8.2c2.9 1.6 6.2 4.4 6.2 8.6 0 3.8-2.8 6.6-6.2 6.6s-6.2-2.8-6.2-6.6c0-4.2 3.3-7 6.2-8.6z" fill="none" stroke="#fff" strokeWidth="1.8" /><path d="M16 11.5v9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".75" /></>,
    text: <g fill="#fff"><rect x="9" y="10" width="14" height="2.2" rx="1.1" /><rect x="9" y="15" width="14" height="2.2" rx="1.1" /><rect x="9" y="20" width="8.5" height="2.2" rx="1.1" /></g>,
    image: <><path d="M7.5 23l5.2-6.3 3.6 4.2 2.6-3L24.5 23z" fill="#fff" /><circle cx="20.5" cy="11.5" r="2.3" fill="#fff" /></>,
    audio: <><path d="M13.2 21V11.6l8.6-2.1v9.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><circle cx="11.2" cy="21" r="2.4" fill="#fff" /><circle cx="19.8" cy="18.7" r="2.4" fill="#fff" /></>,
    video: <path d="M12.6 10.8v10.4l8.8-5.2z" fill="#fff" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />,
    code: <><path d="M12 11.5L7.8 16l4.2 4.5M20 11.5l4.2 4.5-4.2 4.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M17.4 10.2l-2.8 11.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity=".8" /></>,
    // An archive is a seed packet.
    archive: <><path d="M10 11h12v11.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 10 22.5z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.5 8.5h13l-.5 2.5h-12z" fill="#fff" /><path d="M16 21.4c-1.6-.9-2.3-2.4-2.1-4.2 1.7.2 2.8 1.2 3.1 2.7M16 21.4c.3-1.9 1.4-3.1 3.2-3.4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></>,
    pdf: <text x="16" y="19.4" textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing="-.2">PDF</text>
}
