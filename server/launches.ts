import type { Launch } from "@phreshos/core"

/**
 * The Files Server is the "files" Service: the one Process that reaches the machine's files, found by
 * this name by every Files window and by other Programs, such as the Terminal showing a folder. It
 * starts with the System, so other Programs find it present, and starts the panel when it is on.
 */
export const filesService = { name: "files", server: true, client: false } as const satisfies Launch & { name: string }

/**
 * The panel: a Files window of its own in the `over` layer, at the edge of the screen. Like every
 * Files window it is a Client only, and reaches the one Files Server.
 */
export const panelLaunch = { name: "panel", server: false, client: { layer: "over", title: "Files" }, options: { view: "panel" } } as const satisfies Launch & { name: string }

/** Whether the panel is on, kept in the Program store; the Server starts it with the System while it is. */
export const panelShown = "panel.shown"

