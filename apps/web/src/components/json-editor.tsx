"use client";
// The text of a View Design in the Playground (GLOSSARY: Playground, View Design): a plain text box first, which stays
// when the code editor cannot load, and the code editor (components/json-editor-cm.tsx, with help from the schema) once it
// has been loaded on demand. Nothing here is sent anywhere.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Schema } from "@ziffr/core/json-check";
import { Textarea } from "@/components/ui/textarea";
import type { EditorHandle } from "@/components/json-editor-cm";

type Editor = typeof import("@/components/json-editor-cm");

/** The editor for a JSON file: `schema` gives it field and value help, `label` names it for assistive technology. */
export const JsonEditor = forwardRef<EditorHandle, { value: string; onChange: (text: string) => void; schema: Schema; label: string }>(function JsonEditor({ value, onChange, schema, label }, ref) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const plain = useRef<HTMLTextAreaElement>(null);
  const rich = useRef<EditorHandle>(null);

  // Loaded on demand, so no other page grows; if it cannot load, the text box keeps working.
  useEffect(() => {
    let live = true;
    import("@/components/json-editor-cm").then((m) => live && setEditor(m)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    goTo(line) {
      if (rich.current) return rich.current.goTo(line);
      const el = plain.current;
      if (!el || !line) return;
      const lines = value.split("\n");
      const at = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
      el.focus();
      el.setSelectionRange(at, at + (lines[line - 1]?.length ?? 0));
    },
  }));

  if (editor) return <editor.CodeEditor ref={rich} value={value} onChange={onChange} schema={schema} label={label} />;
  return <Textarea ref={plain} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} rows={28} spellCheck={false} className="max-h-[36rem] font-mono text-xs leading-5 [field-sizing:fixed]" />;
});
