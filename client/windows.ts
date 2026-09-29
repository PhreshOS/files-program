import { context } from "@phreshos/client"
import { parseRelativeValue, type Position, type Value } from "@phreshos/core"

/** How far a new Files window stands from the Files window that opened it, down and across. */
const step = 32

/**
 * Opens a folder or a file in a Files window of its own: a Process with only a Client, told where to
 * start by its options. Files places it near what opened it; with no position, the System would open
 * it at the plane's zero, wherever the owner is looking.
 */
export async function openFilesWindow(path: string, title: string, position: Position | null) {
    const program = await context.program()
    await program.createProcess({ client: { title, ...(position ? { position } : {}) }, options: { path } })
}

/**
 * A little down and across from this window. Its position may be in pixels or in views, such as
 * "100% - 262" one view along; either way the step is added in pixels.
 */
export async function besideThisWindow(): Promise<Position | null> {
    const { x, y } = await context.window.position()
    const shiftedX = shifted(x), shiftedY = shifted(y)
    return shiftedX === null || shiftedY === null ? null : { x: shiftedX, y: shiftedY }
}

/** A position value moved on by the step, in the same form it came in. */
function shifted(value: Value): Value | null {
    const parsed = parseRelativeValue(value)
    if (!parsed) return null
    const pixels = parsed.pixels + step
    if (parsed.relative === 0) return pixels
    const share = `${parsed.relative * 100}%`
    return pixels === 0 ? share : `${share} ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
}

/** The width Files declares for its windows, when it is in pixels. */
export async function declaredWidth(): Promise<number | null> {
    const width = (await context.program()).client?.size?.width
    return typeof width === "number" ? width : null
}
