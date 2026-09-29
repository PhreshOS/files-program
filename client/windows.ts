import { context } from "@phreshos/client"
import type { Position } from "@phreshos/core"

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

/** A little down and across from this window, when its position is in pixels. */
export async function besideThisWindow(): Promise<Position | null> {
    const { x, y } = await context.window.position()
    return typeof x === "number" && typeof y === "number" ? { x: x + step, y: y + step } : null
}

/** The width Files declares for its windows, when it is in pixels. */
export async function declaredWidth(): Promise<number | null> {
    const width = (await context.program()).client?.size?.width
    return typeof width === "number" ? width : null
}
