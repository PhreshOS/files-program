import { afterEach, describe, expect, it } from "vitest"
import { isRoot, join, learn, nameAllowed, nameOf, parentOf, stepsOf, within } from "../client/paths"

describe("paths as the machine spells them", () => {
    afterEach(() => learn({ home: "/home/person", separator: "/", roots: ["/"] }))

    it("walks a Unix path down from its one root", () => {
        learn({ home: "/home/person", separator: "/", roots: ["/"] })
        expect(parentOf("/")).toBeNull()
        expect(parentOf("/file.txt")).toBe("/")
        expect(parentOf("/home/person")).toBe("/home")
        expect(join("/", "home")).toBe("/home")
        expect(join("/home", "person")).toBe("/home/person")
        expect(stepsOf("/home/person")).toEqual([{ path: "/", name: "Root" }, { path: "/home", name: "home" }, { path: "/home/person", name: "person" }])
        expect(within("/home/person/notes", "/home/person")).toBe(true)
        expect(within("/home/personal", "/home/person")).toBe(false)
        expect(nameOf("/home/person")).toBe("person")
        expect(nameAllowed("a/b")).toBe(false)
    })

    it("walks a Windows path down from its drive", () => {
        learn({ home: "C:\\Users\\Person", separator: "\\", roots: ["C:\\", "D:\\"] })
        expect(isRoot("C:\\")).toBe(true)
        expect(parentOf("C:\\")).toBeNull()
        expect(parentOf("C:\\Users")).toBe("C:\\")
        expect(parentOf("C:\\Users\\Person")).toBe("C:\\Users")
        expect(join("C:\\", "Users")).toBe("C:\\Users")
        expect(join("C:\\Users\\Person", "Desktop")).toBe("C:\\Users\\Person\\Desktop")
        expect(stepsOf("D:\\Photos\\2026")).toEqual([{ path: "D:\\", name: "D:" }, { path: "D:\\Photos", name: "Photos" }, { path: "D:\\Photos\\2026", name: "2026" }])
        expect(within("C:\\Users\\Person\\Desktop", "C:\\Users\\Person")).toBe(true)
        expect(within("C:\\Users\\Person", "C:\\")).toBe(true)
        expect(nameOf("C:\\")).toBe("C:")
        expect(nameAllowed("a\\b")).toBe(false)
        expect(nameAllowed("a/b")).toBe(false)
    })

    it("finds a network share's root on Windows", () => {
        learn({ home: "C:\\Users\\Person", separator: "\\", roots: ["C:\\"] })
        expect(parentOf("\\\\server\\share\\folder")).toBe("\\\\server\\share\\")
        expect(parentOf("\\\\server\\share\\")).toBeNull()
    })
})
