/**
 * How the machine PhreshOS runs on spells its paths, as its Server tells: the separator, and the
 * roots every path starts from: `/` alone on macOS and Linux, a root per drive on Windows, such as
 * `C:\`. Paths are kept as the machine spells them, so the System and other Programs take them as they are.
 */
export type Machine = Readonly<{ home: string, separator: "/" | "\\", roots: readonly string[] }>

let separator: Machine["separator"] = "/"
let roots: readonly string[] = ["/"]

/** Learns how this machine spells its paths, once, before any window shows one. */
export function learn(machine: Machine) {
    separator = machine.separator
    roots = machine.roots
}

/** The roots every path on this machine starts from. */
export function rootsOf() {
    return roots
}

export function isRoot(path: string) {
    return roots.includes(path)
}

/** The root a path starts from: a known one, or a network share's, such as `\\server\share\`. */
function rootOf(path: string) {
    const known = roots.filter(root => path.startsWith(root)).sort((a, b) => b.length - a.length)[0]
    if (known !== undefined) return known
    const share = /^\\\\[^\\]+\\[^\\]+\\?/.exec(path)?.[0]
    return share === undefined ? "" : share.endsWith("\\") ? share : `${share}\\`
}

/** A root as people read it: "Root" for `/`, the drive for a drive, such as "C:". */
export function rootName(root: string) {
    return root === "/" ? "Root" : root.replace(/[\\/]+$/, "")
}

/** An entry named `name` inside `folder`. */
export function join(folder: string, name: string) {
    return folder.endsWith(separator) ? `${folder}${name}` : `${folder}${separator}${name}`
}

/** Whether `path` is `folder` or inside it. */
export function within(path: string, folder: string) {
    return path === folder || path.startsWith(folder.endsWith(separator) ? folder : `${folder}${separator}`)
}

/** The folder a path is in, or `null` for a root. */
export function parentOf(path: string) {
    const root = rootOf(path)
    if (path === root) return null
    const parent = path.slice(0, path.lastIndexOf(separator))
    return parent.length < root.length ? root : parent
}

/** The folders from a path's root down to the path itself, each with its name. */
export function stepsOf(path: string) {
    const root = rootOf(path)
    const steps = [{ path: root, name: rootName(root) }]
    for (const name of path.slice(root.length).split(separator).filter(Boolean)) steps.push({ path: join(steps.at(-1)!.path, name), name })
    return steps
}

/** The name of the last folder or file in a path; a root's own name for a root. */
export function nameOf(path: string) {
    const root = rootOf(path)
    return path === root ? rootName(root) : path.slice(path.lastIndexOf(separator) + 1)
}

/** Whether a name can be an entry's: one that would reach into another folder cannot. */
export function nameAllowed(name: string) {
    return name !== "" && !name.includes("/") && !name.includes(separator)
}
