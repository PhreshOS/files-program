import { randomUUID } from "node:crypto"
import type { Progress } from "./operations"

/** One long operation, as every Files window shows it. */
export type Task = Readonly<{
    id: string
    kind: "copy" | "move" | "trash" | "upload" | "download"
    /** What it does, in words, such as “Copying “Report.pdf” to “Documents””. */
    title: string
    /** How far it is, and of how much once measured, in its unit. */
    done: number
    total: number | null
    unit: "bytes" | "items"
    state: "running" | "failed"
    problem: string | null
}>

type Held = { -readonly [Key in keyof Task]: Task[Key] } & { controller: AbortController }

/** How often, at most, the tasks are announced while they move. */
const pace = 200

/**
 * The long operations of the one Files Server, which every window shows. A task is announced while it
 * runs; one that ends leaves the list, one that fails stays with its problem until dismissed, and one
 * that is stopped leaves the list at once.
 */
export function taskList(announce: (tasks: readonly Task[]) => void) {
    const tasks = new Map<string, Held>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const list = (): Task[] => [...tasks.values()].map(({ controller: _controller, ...task }) => task)

    function changed() {
        timer ??= setTimeout(() => { timer = null; announce(list()) }, pace)
    }

    /** Starts one task, and hands its progress to the operation it follows. */
    function start(kind: Task["kind"], title: string, unit: Task["unit"], total: number | null = null) {
        const task: Held = { id: randomUUID(), kind, title, done: 0, total, unit, state: "running", problem: null, controller: new AbortController() }
        tasks.set(task.id, task)
        changed()
        const progress: Progress = {
            signal: task.controller.signal,
            measured: amount => { task.total = amount; changed() },
            advanced: amount => { task.done += amount; changed() }
        }
        return {
            progress,
            finish() { tasks.delete(task.id); changed() },
            /** Leaves without a problem, such as a download nobody reads any more. */
            drop() { tasks.delete(task.id); changed() },
            fail(error: unknown) {
                if (task.controller.signal.aborted) tasks.delete(task.id)
                else Object.assign(task, { state: "failed", problem: error instanceof Error ? error.message : String(error) })
                changed()
            }
        }
    }

    return {
        list,
        start,
        /** Runs one operation as a task. */
        async run<Result>(kind: Task["kind"], title: string, unit: Task["unit"], operation: (progress: Progress) => Promise<Result>): Promise<Result> {
            const task = start(kind, title, unit)
            try {
                const result = await operation(task.progress)
                task.finish()
                return result
            }
            catch (error) {
                task.fail(error)
                throw error
            }
        },
        stop(id: string) {
            tasks.get(id)?.controller.abort(new Error("Stopped"))
        },
        dismiss(id: string) {
            if (tasks.get(id)?.state === "failed") { tasks.delete(id); changed() }
        }
    }
}
