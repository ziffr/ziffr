"use client";
// Slides and free layouts keep only what is stored in them (spec 0009, ticket #131; GLOSSARY: Deck, Widget): a link
// pasted or dropped would become a link preview, an embedded page or an image loaded from another site, which tells
// that site whenever the slide is shown. Pasted and dropped image files keep working; the core refuses the rest
// when saving anyway.
import { toast } from "sonner";
import type { Editor, TLUiOverrides } from "tldraw";

/** Turns pasted and dropped links into nothing on this editor, and says what to do instead. */
export function keepContentLocal(editor: Editor): void {
  const refuse = () => toast.info("Links can't go on a slide", { description: "A link would load from another site whenever the slide is shown. Paste or drop the image itself instead." });
  editor.registerExternalContentHandler("url", refuse);
  editor.registerExternalContentHandler("embed", refuse);
}

/** The editor's tools without the one for embedding other sites. */
export const LOCAL_ONLY_OVERRIDES: TLUiOverrides = {
  tools(_editor, tools) {
    const { embed: _embed, ...rest } = tools;
    void _embed;
    return rest;
  },
};
