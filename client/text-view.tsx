import { useEffect, useMemo, useRef } from "react"
import { ScrollArea, useAppearance, useColor, useThemedValue } from "@phreshos/react-ui"
import { EditorState, StateEffect, type Extension } from "@codemirror/state"
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view"
import { bracketMatching, codeFolding, foldGutter, HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { tags } from "@lezer/highlight"

/**
 * A text file as it reads: line numbers, the highlighting of its language, folding, and search. It
 * can be selected and copied but not changed. Its colors are the Appearance colors, so it follows the
 * theme and the owner's palette.
 */
export default function TextView({ name, text }: Readonly<{ name: string, text: string }>) {
    const host = useRef<HTMLDivElement>(null)
    const look = useLook()

    useEffect(() => {
        const parent = host.current
        if (!parent) return
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: text,
                extensions: [
                    EditorState.readOnly.of(true),
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
        return () => { current = false; view.destroy() }
    }, [name, text, look])

    // The text scrolls in the same ScrollArea as the rest of the interface; CodeMirror follows that
    // scrolling and still draws only the lines in view.
    return <ScrollArea className="text-view"><div ref={host} /></ScrollArea>
}

/** The editor's colors and type, from the Appearance. */
function useLook(): Extension {
    const colors = useThemedValue(useAppearance().colors)
    const primary = useColor("primary")
    const foreground = useColor("foreground")
    return useMemo(() => [
        EditorView.theme({
            "&": { color: colors.foreground, backgroundColor: "transparent", fontSize: "0.8125rem" },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.55" },
            ".cm-content": { caretColor: colors.foreground },
            ".cm-gutters": { backgroundColor: "transparent", color: foreground.soft, border: "none" },
            // The current line shows only while the text has focus.
            ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
            "&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter": { backgroundColor: foreground.subtle },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: primary.soft },
            ".cm-selectionMatch": { backgroundColor: primary.subtle },
            ".cm-matchingBracket": { backgroundColor: primary.subtle, outline: "none" },
            ".cm-searchMatch": { backgroundColor: primary.soft },
            ".cm-panels": { backgroundColor: "transparent", color: colors.foreground },
            ".cm-panels-top": { borderBottom: `1px solid ${foreground.subtle}` }
        }),
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
    ], [colors, primary, foreground])
}
