"use client";
// Edits a widget's own title (GLOSSARY: Widget, Placeholder). Empty means the default title; the default shows as the
// field's placeholder text and a live preview shows the title filled in from the data the page already has.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaceholderHints } from "@/components/placeholder-hints";
import { frameTitle, type FrameWidget } from "@/components/read-only-frame";
import { widgetMetrics } from "@/views/widget-body";
import type { CanvasData } from "@ziffr/core/types";

/** The longest title the core keeps (dashboards.ts cuts at 200 characters). */
export const MAX_TITLE = 200;

/** The title as the card would draw it with this text, an empty text falling back to the default. */
export function previewTitle(widget: FrameWidget, data: CanvasData, text: string): string {
  const w = { ...widget, title: text.trim() || null };
  return frameTitle(w, widgetMetrics(w, data), data);
}

/** The Title field of a widget's settings: input, preview and the shared Placeholder hints; saves null when emptied. */
export function WidgetTitleEditor({ widget, data, onSave }: { widget: FrameWidget; data: CanvasData; onSave: (title: string | null) => void }) {
  const [text, setText] = useState(widget.title ?? "");
  const fallback = previewTitle(widget, data, "");
  const shown = previewTitle(widget, data, text);
  return (
    <form className="space-y-3 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); onSave(text.trim() || null); }}>
      <div className="font-semibold">Title</div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Leave empty for the default title. Words in braces fill themselves in, see below.</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={fallback} maxLength={MAX_TITLE} aria-label="Title" />
      </label>
      <p className="text-xs text-muted-foreground">Shown as: <span data-testid="title-preview" className="font-medium text-foreground">{shown || "(no title)"}</span></p>
      <PlaceholderHints />
      <Button type="submit" size="sm">Save title</Button>
    </form>
  );
}
