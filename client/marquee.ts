import { useRef, useState, type PointerEvent } from "react"

/** Where the box is, inside the area it is drawn in. */
export type Box = Readonly<{ left: number, top: number, width: number, height: number }>

type Rect = Readonly<{ left: number, top: number, right: number, bottom: number }>

type Gesture = {
    area: HTMLElement
    /** What stays chosen whatever the box covers: nothing, or the entries chosen before with Shift or Command. */
    base: readonly string[]
    start: Readonly<{ x: number, y: number }>
    pointer: { x: number, y: number }
    drawing: boolean
    /** Every entry the gesture has seen, where it was in the area; an entry scrolled out of the list keeps its place. */
    seen: Map<string, Rect>
    frame: number
}

/** How far a press must move before it draws a box instead of staying a press. */
const threshold = 4

/** How close to the top or bottom of the scrolling view the pointer scrolls it, and how fast at most. */
const edge = 32
const speed = 18

/** The entries of the area, without the table's header. */
const entrySelector = "[role=row][data-key]:not(thead [role=row])"

/** A press on these is not on the space around the entries. */
const notSpace = "[role=row], [role=columnheader], [data-phreshos-scroll-area-scrollbar], input"

/**
 * Choosing entries by drawing a box around them, from a press on the space around them. The box
 * chooses every entry it touches; with Shift or Command held it adds to what was chosen, and without
 * them a press first lets go of it. Near the top or bottom of the view, the view scrolls on its own.
 */
export default function useMarquee(chosen: readonly string[], choose: (paths: readonly string[]) => void) {
    const [box, setBox] = useState<Box | null>(null)
    const gesture = useRef<Gesture | null>(null)

    function update(current: Gesture) {
        const origin = current.area.getBoundingClientRect()
        const x = current.pointer.x - origin.left, y = current.pointer.y - origin.top
        const next = { left: Math.min(current.start.x, x), top: Math.min(current.start.y, y), width: Math.abs(x - current.start.x), height: Math.abs(y - current.start.y) }
        setBox(next)
        for (const entry of current.area.querySelectorAll(entrySelector)) {
            const rect = entry.getBoundingClientRect()
            current.seen.set(entry.getAttribute("data-key")!, { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top })
        }
        const touched = [...current.seen].filter(([, rect]) => rect.left < next.left + next.width && rect.right > next.left && rect.top < next.top + next.height && rect.bottom > next.top)
        choose([...new Set([...current.base, ...touched.map(([path]) => path)])])
    }

    /** Scrolls the view while the pointer rests near its top or bottom, and grows the box with it. */
    function follow(current: Gesture) {
        const view = current.area.closest("[data-phreshos-scroll-area-viewport]")
        if (view) {
            const rect = view.getBoundingClientRect()
            const over = current.pointer.y < rect.top + edge ? current.pointer.y - rect.top - edge : current.pointer.y > rect.bottom - edge ? current.pointer.y - rect.bottom + edge : 0
            if (over) {
                view.scrollTop += Math.max(-speed, Math.min(speed, over / 2))
                update(current)
            }
        }
        current.frame = requestAnimationFrame(() => follow(current))
    }

    function end() {
        const current = gesture.current
        if (!current) return
        cancelAnimationFrame(current.frame)
        gesture.current = null
        setBox(null)
    }

    return {
        box,
        onPointerDown(event: PointerEvent<HTMLElement>) {
            const target = event.target
            if (event.button !== 0 || !(target instanceof Element) || target.closest(notSpace)) return
            const adding = event.shiftKey || event.metaKey || event.ctrlKey
            if (!adding) choose([])
            const area = event.currentTarget, origin = area.getBoundingClientRect()
            gesture.current = {
                area, base: adding ? chosen : [],
                start: { x: event.clientX - origin.left, y: event.clientY - origin.top },
                pointer: { x: event.clientX, y: event.clientY },
                drawing: false, seen: new Map(), frame: 0
            }
            area.setPointerCapture(event.pointerId)
            // The press draws a box; it must not select text on the way.
            event.preventDefault()
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const current = gesture.current
            if (!current) return
            current.pointer = { x: event.clientX, y: event.clientY }
            if (!current.drawing) {
                const origin = current.area.getBoundingClientRect()
                if (Math.hypot(event.clientX - origin.left - current.start.x, event.clientY - origin.top - current.start.y) < threshold) return
                current.drawing = true
                follow(current)
            }
            update(current)
        },
        onPointerUp: end,
        onPointerCancel: end
    }
}
