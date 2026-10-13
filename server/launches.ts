import type { Launch } from "@phreshos/core"

/**
 * The Files Server: the one Process that reaches the machine's files, found by this name by every
 * Files window and by no other Program. It starts with the System, and starts the picker, and the
 * panel when it is on.
 */
export const filesLaunch = { name: "files", server: true, client: false } as const satisfies Launch & { name: string }

/**
 * The picker: the one Service Files offers, for what a person takes part in, choosing a file to open
 * or a place to save one. Its Process is named locally; its Service name is public across the System,
 * with its version in it: a contract that changes takes a new name.
 */
export const pickerLaunch = { name: "picker", server: { service: "file-picker-v1" }, client: false } as const satisfies Launch & { name: string }

/** The `view` of a Files window that asks a person to choose for another Program. */
export const pickerView = "picker"

/**
 * The panel: a Files window of its own in the `over` layer, at the edge of the screen. Like every
 * Files window it is a Client only, and reaches the one Files Server.
 */
export const panelLaunch = { name: "panel", server: false, client: { layer: "over", title: "Files" }, options: { view: "panel" } } as const satisfies Launch & { name: string }

/** Whether the panel is on, kept in the Program store; the Server starts it with the System while it is. */
export const panelShown = "panel.shown"

