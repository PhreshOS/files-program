import { describe, expect, it } from "vitest"
import { kindOf, parentOf, sortEntries, type Entry } from "../client/entries"

describe("file entries", () => {
    it("classifies known file extensions without treating dotfiles as extensions", () => {
        expect(kindOf("photo.PNG")).toBe("image")
        expect(kindOf(".profile")).toBe("file")
        expect(kindOf("archive.unknown")).toBe("file")
    })

    it("finds a parent while preserving the filesystem root", () => {
        expect(parentOf("/")).toBeNull()
        expect(parentOf("/file.txt")).toBe("/")
        expect(parentOf("/home/person")).toBe("/home")
    })

    it("keeps folders before files for either sort direction", () => {
        const entries: Entry[] = [
            { path: "/a.txt", name: "a.txt", kind: "text", size: 1, modified: 1 },
            { path: "/z", name: "z", kind: "folder", modified: 1 }
        ]
        expect(sortEntries(entries, "name", "ascending").map(entry => entry.path)).toEqual(["/z", "/a.txt"])
        expect(sortEntries(entries, "name", "descending").map(entry => entry.path)).toEqual(["/z", "/a.txt"])
    })
})
