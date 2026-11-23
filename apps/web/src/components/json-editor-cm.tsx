"use client";
// The code editor of the Playground (GLOSSARY: Playground, View Design): CodeMirror with JSON colours, and completion and
// hover help from the View Design's schema. Loaded only on the Playground (components/json-editor.tsx imports it on
// demand), so no other page carries it. Tab is not taken by the editor, so the keyboard can always move on.
// Security: the text is the person's own and stays in the page; nothing is fetched, and the help is read from the schema
// the checks run.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, hoverTooltip, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { Schema } from "@ziffr/core/json-check";
import { completionsAt, hoverAt } from "@/lib/json-schema-help";

/** What the page may ask of the editor. */
export type EditorHandle = { goTo: (line: number) => void };

// Colours come from the Theme's tokens, so the editor follows light and dark.
const colours = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--foreground)", fontWeight: "600" },
  { tag: tags.string, color: "var(--primary)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--muted-foreground)" },
  { tag: [tags.punctuation, tags.separator, tags.brace, tags.squareBracket], color: "var(--muted-foreground)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "12px", backgroundColor: "var(--card)", color: "var(--foreground)", border: "1px solid var(--input)", borderRadius: "var(--radius-input)" },
  "&.cm-focused": { outline: "2px solid var(--ring)" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.25rem", maxHeight: "36rem", minHeight: "30rem" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
  ".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: "var(--radius-input)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" },
  ".cm-help": { padding: "6px 8px", maxWidth: "26rem", whiteSpace: "pre-wrap", fontFamily: "inherit" },
  ".cm-completionInfo": { whiteSpace: "pre-wrap", maxWidth: "22rem" },
});

/** The editor: `value` is the text, `onChange` hears every edit, and `schema` drives the help. */
export const CodeEditor = forwardRef<EditorHandle, { value: string; onChange: (text: string) => void; schema: Schema; label: string }>(function CodeEditor({ value, onChange, schema, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const heard = useRef(onChange);
  heard.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const complete = (c: CompletionContext) => {
      const found = completionsAt(schema, c.state.doc.toString(), c.pos);
      if (!found || (!c.explicit && found.from === found.to && !c.matchBefore(/[",{\s]/))) return null;
      // What is typed so far, without its quote, narrows the list (the editor's own matching would trip on the quote).
      const typed = c.state.sliceDoc(found.from, c.pos).replace(/^"/, "").toLowerCase();
      return {
        from: found.from,
        to: found.to,
        filter: false,
        options: found.items.filter((i) => i.label.toLowerCase().startsWith(typed)).map((i) => ({ label: i.label, apply: i.apply, info: i.info, type: i.kind === "field" ? "property" : "enum" })),
      };
    };
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        json(),
        syntaxHighlighting(colours),
        autocompletion({ override: [complete], activateOnTyping: true }),
        hoverTooltip((v, pos) => {
          const h = hoverAt(schema, v.state.doc.toString(), pos);
          return h ? { pos: h.from, end: h.to, create: () => { const dom = document.createElement("div"); dom.className = "cm-help"; dom.textContent = h.text; return { dom }; } } : null;
        }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) heard.current(u.state.doc.toString());
        }),
        theme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // The editor is made once; later text from outside goes in through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, label]);

  // Text that comes from outside (a built-in design chosen, a file uploaded) replaces the document.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useImperativeHandle(ref, () => ({
    goTo(line) {
      const v = view.current;
      if (!v || line < 1 || line > v.state.doc.lines) return;
      const l = v.state.doc.line(line);
      v.dispatch({ selection: { anchor: l.from, head: l.to }, scrollIntoView: true });
      v.focus();
    },
  }));

  return <div ref={host} />;
});
