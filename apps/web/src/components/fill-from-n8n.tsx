"use client";
// Fill from n8n (spec 0043, ticket 5; GLOSSARY: Automation Template, Feed, Feed Key): an Owner or Admin picks a template
// and a Feed for some Metrics and downloads the n8n workflow with this Ziffr's address already in it, a starter sheet
// naming the Metrics, and, if they ask, a new Feed Key shown once beside the file, never in it. The core checks who may
// and that the Metrics are theirs to change; Ziffr never runs the workflow or holds the other system's login.
import { useState, useTransition } from "react";
import { Copy, Download, Workflow } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { csvFile } from "@/lib/csv-file";
import { Button } from "@/components/ui/button";
import { downloadFeedTemplate } from "@/app/feed-template-actions";

type Template = { id: string; label: string; reads: string; needs: string; rows: boolean };
type Made = { fileName: string; workflow: string; startSheet: string | null; feed: { id: string; name: string }; key: { secret: string; expiresOn: string } | null; metrics: { slug: string; name: string }[] };

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

/** Hands the browser a file to save. */
function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** The button and the form that opens: for these Metrics, one of the templates and one of the Workspace's Feeds. */
export function FillFromN8n({ metrics, feeds, templates }: { metrics: { id: number; name: string }[]; feeds: { id: string; name: string }[]; templates: Template[] }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const [feed, setFeed] = useState(feeds[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [makeKey, setMakeKey] = useState(true);
  const [made, setMade] = useState<Made | null>(null);
  const [pending, start] = useTransition();
  if (!templates.length || !metrics.length) return null;
  const chosen = templates.find((t) => t.id === template) ?? templates[0];
  if (!open) return <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}><Workflow aria-hidden /> Fill from n8n</Button>;

  const make = () => start(async () => {
    try {
      const r = unwrap(await downloadFeedTemplate({ template, metrics: metrics.map((m) => m.id), feedId: feed || null, newFeedName: newName, makeKey })) as Made;
      setMade(r);
      save(r.fileName, r.workflow, "application/json");
    } catch (e) {
      toast.error("Nothing was made", { description: shown(e) });
    }
  });

  if (made) {
    return (
      <div className="mt-3 space-y-2 rounded-[var(--radius-input)] border border-input p-3 text-sm" aria-live="polite">
        <p className="font-medium">The n8n workflow for {chosen.label} is downloaded</p>
        <p className="text-xs text-muted-foreground">It is the Feed “{made.feed.name}” that sends the values, and it now takes values for {made.metrics.map((m) => m.name).join(", ")}.</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs">
          <li>In n8n, import <code>{made.fileName}</code> (Workflows → Import from file) and fill in its <strong>Settings</strong> node{chosen.rows ? ": the sheet's id and the tab's name" : `: which Metric each figure is for (${made.metrics.map((m) => m.slug).join(", ")}) and what it asks`}. Your Ziffr&rsquo;s address is in it already.</li>
          {chosen.rows && made.startSheet && <li>Put the Metrics in your sheet: <button type="button" className="underline" onClick={() => save("ziffr-metrics.csv", csvFile(made.startSheet!), "text/csv;charset=utf-8")}>download the starter sheet</button> (a column <code>metric</code> with these slugs, <code>value</code>, and an optional <code>period</code>).</li>}
          <li>{made.key ? "Make a Header Auth credential in n8n named Ziffr Feed Key: name Authorization, value Bearer followed by the key below." : "Use a Feed Key of this Feed (Settings → Feeds) in a Header Auth credential in n8n named Ziffr Feed Key: name Authorization, value Bearer followed by the key."}</li>
          <li>You need: {chosen.needs}</li>
        </ol>
        {made.key && (
          <div className="rounded-[var(--radius-input)] bg-muted p-2 text-xs">
            <p className="font-medium">Your Feed Key, shown once (works until {made.key.expiresOn})</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="fig break-all">{made.key.secret}</code>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(made.key!.secret).then(() => toast.success("Copied"), () => toast.error("Not copied", { description: "Select it and copy by hand." })); }}><Copy aria-hidden /> Copy</Button>
            </div>
            <p className="mt-1 text-muted-foreground">It is not in the file. Keep it in n8n&rsquo;s credential. If it leaks, revoke it under Settings → Feeds.</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => save(made.fileName, made.workflow, "application/json")}><Download aria-hidden /> Download the workflow again</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMade(null); setOpen(false); }}>Done</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-input)] border border-input p-3 text-sm">
      <div>
        <p className="font-medium">Fill {metrics.length === 1 ? metrics[0].name : `${metrics.length} Metrics`} from n8n</p>
        <p className="text-xs text-muted-foreground">Downloads a ready n8n workflow with your Ziffr&rsquo;s address in it. You add the other system&rsquo;s login in n8n; Ziffr never sees it and never runs the workflow. The Feed you pick becomes a Submitter of {metrics.length === 1 ? "this Metric" : "these Metrics"}; a Feed Key works for every Metric its Feed submits to, so a new Feed keeps a key to these only.</p>
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs font-medium">Read from</span>
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className={field} aria-label="Template">
          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{chosen.reads}</span>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs font-medium">Sent by</span>
        <select value={feed} onChange={(e) => setFeed(e.target.value)} className={field} aria-label="Feed">
          {feeds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          <option value="">A new Feed…</option>
        </select>
        {!feed && <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} placeholder={chosen.label} aria-label="Name of the new Feed" className={`${field} w-56`} />}
      </label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={makeKey} onChange={(e) => setMakeKey(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> Make a Feed Key for it and show it once (not written into the file; it ends within a year)</label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={pending} onClick={make}>Download the workflow</Button>
      </div>
    </div>
  );
}
