"use client";
// The View Designs part of the Library (spec 0024; GLOSSARY: View Design, Sample Data): every design drawn with Sample Data, each to
// export with a Sample Data file; Owners and Admins add one from a file, checked as they paste it and again on the
// server, and remove one. Security: a design is drawn from its checked file only, with made-up Sample Data.
import { useMemo, useRef, useState, useTransition } from "react";
import { FileDown, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { BUILT_IN_DESIGNS, DESIGNED_VIEWS } from "@ziffr/core/built-in-designs";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { checkViewDesign, VIEW_LIMITS, type ViewDesign } from "@ziffr/core/view-design";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Problem } from "@ziffr/core/json-check";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Preview } from "@/components/preview";
import { downloadDesign } from "@/lib/design-download";
import { addViewDesign, removeViewDesign } from "@/app/design-actions";

type Props = { designs: { id: number; name: string; body: ViewDesign }[]; manages: boolean; demo: boolean; viewer: string; numberStyle: NumberStyle };

/** The View Designs page: built-in and the Workspace's, with adding and removing for Owners and Admins. */
export function DesignsScreen({ designs, manages, demo, viewer, numberStyle }: Props) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  const [, start] = useTransition();
  return (
    <div className="space-y-8">
      <section aria-labelledby="ws-designs">
        <h2 id="ws-designs" className="mb-2 text-sm font-medium">The Workspace&rsquo;s View Designs</h2>
        {designs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. {manages ? "Add one below, from a file you exported and changed." : "Owners and Admins add them."}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((d) => (
              <DesignCard key={d.id} design={d.body} data={data}>
                {manages && (
                  <Button variant="ghost" size="sm" onClick={() => window.confirm(`Remove ${d.name} from the Workspace? Widgets already drawn with it keep it.`) && start(async () => { await removeViewDesign(d.id); toast.success(`Removed ${d.name}`); })}>
                    <Trash2 /> Remove
                  </Button>
                )}
              </DesignCard>
            ))}
          </ul>
        )}
      </section>
      {manages && <AddDesign />}
      {demo && <p className="text-sm text-muted-foreground">The demo keeps no View Designs: the Workspace is shared by everyone looking at it.</p>}
      <section aria-labelledby="built-in-designs">
        <h2 id="built-in-designs" className="mb-2 text-sm font-medium">Built-in View Designs</h2>
        <p className="mb-3 text-sm text-muted-foreground">Export any of them as a starting point: you get the design and a Sample Data file to try it with.</p>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESIGNED_VIEWS.map((id) => <DesignCard key={id} design={BUILT_IN_DESIGNS[id]} data={data} />)}
        </ul>
      </section>
    </div>
  );
}

function DesignCard({ design, data, children }: { design: ViewDesign; data: ReturnType<typeof sampleCanvasData>; children?: React.ReactNode }) {
  return (
    <li className="stock flex flex-col gap-2 rounded-[var(--radius-card)] p-3">
      {/* The preview is drawn 300 px wide; on the smallest phones it is shrunk to fit the card. */}
      <div className="max-[359px]:[zoom:0.88]"><Preview widget={sampleDesignWidget(design)} data={data} size={design.size} width={300} sample /></div>
      <div className="min-w-0">
        {/* A design's words are shown as text, like everything a person brings in. */}
        <p className="truncate text-sm font-medium">{design.name}</p>
        {design.description && <p className="text-xs text-muted-foreground">{design.description}</p>}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <Button variant="outline" size="sm" onClick={() => downloadDesign(design)}><FileDown /> Export</Button>
        {children}
      </div>
    </li>
  );
}

/** Adding a design from its file: checked as it is pasted, then again by the core on the server. */
function AddDesign() {
  const [text, setText] = useState("");
  const [server, setServer] = useState<Problem[] | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const check = useMemo(() => (text.trim() ? checkViewDesign(text) : null), [text]);
  const problems = server ?? (check && !check.ok ? check.problems : []);
  const read = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > VIEW_LIMITS.bytes) return toast.error(`That file is ${f.size.toLocaleString("en")} bytes; a View Design has at most ${VIEW_LIMITS.bytes.toLocaleString("en")}.`);
    setServer(null);
    setText(await f.text());
  };
  return (
    <section aria-labelledby="add-design" className="space-y-2">
      <h2 id="add-design" className="text-sm font-medium">Add a View Design</h2>
      <p className="text-sm text-muted-foreground">Paste the design&rsquo;s file or upload it. Once added, everyone in the Workspace can choose it in the Pool, like a built-in View.</p>
      <Textarea aria-label="The View Design's file" value={text} onChange={(e) => { setServer(null); setText(e.target.value); }} rows={10} spellCheck={false} className="font-mono text-xs" placeholder='{ "format": "ziffr.view/1", … }' />
      {problems.length > 0 && (
        <ul aria-live="polite" className="space-y-0.5 text-xs text-destructive">
          {problems.slice(0, 20).map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ""}{p.path ? <code>{p.path}</code> : null}{p.path ? " " : ""}{p.message}</li>)}
          {problems.length > 20 && <li>…and {problems.length - 20} more.</li>}
        </ul>
      )}
      {check?.ok && <p aria-live="polite" className="text-xs text-muted-foreground">“{check.design.name}” passes the checks.</p>}
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> Upload a file</Button>
        <Button size="sm" disabled={!check?.ok || pending} onClick={() => start(async () => {
          const res = await addViewDesign(text);
          if (res.ok) { toast.success("Added to the Workspace"); setText(""); } else setServer(res.problems);
        })}><Plus /> Add to the Workspace</Button>
      </div>
    </section>
  );
}
