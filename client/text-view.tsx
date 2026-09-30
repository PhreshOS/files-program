import { useEffect, useMemo, useRef, useState } from "react"
import { Button, ScrollArea, Text, useAppearance, useColor, usePreferences, useThemedValue } from "@phreshos/react-ui"
import { EditorState, StateEffect, type Extension } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view"
import { bracketMatching, codeFolding, foldGutter, HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { tags } from "@lezer/highlight"

/**
 * A text file as it reads: line numbers, the highlighting of its language, folding, and search. It
 * can be edited in place and saved with the Save button or ⌘S, unless only its beginning is shown,
 * since saving that would cut the file short. Its colors are the Appearance colors, so it follows the
 * theme and the owner's palette.
 */
export default function TextView({ name, text, save }: Readonly<{ name: string, text: string, save?: (text: string) => Promise<unknown> }>) {
    const host = useRef<HTMLDivElement>(null)
    const editor = useRef<EditorView | null>(null)
    const look = useLook()
    // The text as it was last read or saved, and whether the text shown differs from it.
    const saved = useRef(text)
    const [edited, setEdited] = useState(false)
    const [saving, setSaving] = useState(false)
    const [problem, setProblem] = useState<string | null>(null)
    const latest = useRef({ save, edited })
    latest.current = { save, edited }

    async function write() {
        const view = editor.current, store = latest.current.save
        if (!view || !store || saving) return
        const next = view.state.doc.toString()
        setSaving(true)
        setProblem(null)
        try {
            await store(next)
            saved.current = next
            setEdited(view.state.doc.toString() !== next)
        }
        catch (error) {
            setProblem(error instanceof Error ? error.message : "The file could not be saved.")
        }
        finally {
            setSaving(false)
        }
    }
    const writing = useRef(write)
    writing.current = write

    // The file read again after a change elsewhere shows at once, unless it is being edited here.
    useEffect(() => {
        const view = editor.current
        if (!view || latest.current.edited || text === saved.current) return
        saved.current = text
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
        setEdited(false)
    }, [text])

    useEffect(() => {
        const parent = host.current
        if (!parent) return
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: saved.current,
                extensions: [
                    EditorState.readOnly.of(!save),
                    EditorView.editable.of(!!save),
                    history(),
                    keymap.of([
                        { key: "Mod-s", preventDefault: true, run: () => { void writing.current(); return true } },
                        indentWithTab,
                        ...defaultKeymap,
                        ...historyKeymap
                    ]),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) setEdited(update.state.doc.toString() !== saved.current)
                    }),
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    highlightSpecialChars(),
                    drawSelection(),
                    highlightActiveLine(),
                    codeFolding(),
                    foldGutter(),
                    bracketMatching(),
                    highlightSelectionMatches(),
                    search({ top: true }),
                    keymap.of(searchKeymap),
                    EditorView.lineWrapping,
                    look
                ]
            })
        })
        // The language arrives on its own, by the file's name; until then the text shows plain.
        let current = true
        void LanguageDescription.matchFilename(languages, name)?.load().then(language => {
            if (current) view.dispatch({ effects: StateEffect.appendConfig.of(language) })
        })
        editor.current = view
        return () => { current = false; editor.current = null; view.destroy() }
    }, [name, look, !!save])

    // The text scrolls in the same ScrollArea as the rest of the interface; CodeMirror follows that
    // scrolling and still draws only the lines in view.
    return <div className="text-edit">
        <ScrollArea className="text-view"><div ref={host} /></ScrollArea>
        {save && (edited || problem) && <div className="text-save">
            <Text size="small" tone={problem ? undefined : "secondary"} className="truncate" style={{ flex: "1 1 auto", minWidth: 0 }}>
                {problem ?? "Edited"}
            </Text>
            <Button size="small" color="primary" pending={saving} disabled={!edited} onPress={() => void write()}>Save</Button>
        </div>}
    </div>
}

/** The editor's colors and type, from the Appearance. */
function useLook(): Extension {
    const colors = useThemedValue(useAppearance().colors)
    const dark = usePreferences().theme === "dark"
    const primary = useColor("primary")
    const foreground = useColor("foreground")
    // The soft primary is too close to a dark background to see; there the primary itself shows through.
    const selection = dark ? `color-mix(in oklab, ${colors.primary} 45%, transparent)` : primary.soft
    return useMemo(() => [
        EditorView.theme({
            "&": { color: colors.foreground, backgroundColor: "transparent", fontSize: "0.8125rem" },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.55" },
            ".cm-content": { caretColor: colors.foreground },
            // The cursor is drawn, not the browser's own, so it takes the text's color here.
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.foreground },
            ".cm-gutters": { backgroundColor: "transparent", color: foreground.soft, border: "none" },
            // The current line shows only while the text has focus.
            ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
            // See-through, since it lies over the selection: an opaque one would hide it on this line.
            "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": { backgroundColor: `color-mix(in oklab, ${colors.foreground} 6%, transparent)` },
            // As specific as CodeMirror's own selection rules, so the selection is ours in both themes.
            "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": { backgroundColor: selection },
            ".cm-selectionMatch": { backgroundColor: primary.subtle },
            ".cm-matchingBracket": { backgroundColor: primary.subtle, outline: "none" },
            ".cm-searchMatch": { backgroundColor: selection },
            ".cm-panels": { backgroundColor: "transparent", color: colors.foreground },
            ".cm-panels-top": { borderBottom: `1px solid ${foreground.subtle}` }
        }, { dark }),
        syntaxHighlighting(HighlightStyle.define([
            { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: colors.secondary },
            { tag: [tags.string, tags.special(tags.string), tags.regexp], color: colors.success },
            { tag: [tags.number, tags.bool, tags.null, tags.atom], color: colors.warning },
            { tag: [tags.comment, tags.meta], color: foreground.soft, fontStyle: "italic" },
            { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: colors.info },
            { tag: [tags.typeName, tags.className, tags.tagName, tags.heading], color: primary.strong, fontWeight: "600" },
            { tag: [tags.propertyName, tags.attributeName], color: colors.info },
            { tag: tags.invalid, color: colors.danger },
            { tag: tags.link, textDecoration: "underline" },
            { tag: tags.emphasis, fontStyle: "italic" },
            { tag: tags.strong, fontWeight: "700" }
        ]))
    ], [colors, primary, foreground, dark, selection])
}
