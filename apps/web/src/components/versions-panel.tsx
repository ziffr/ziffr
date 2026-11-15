"use client";
// Version history of one object (GLOSSARY: Version): who changed what and when, named versions, restore.
import { RelativeTime } from "@/components/relative-time";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { History, RotateCcw, Tag } from "lucide-react";
import { listVersions, nameVersion, restoreVersion, saveNamedVersion } from "@/app/version-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Profile } from "@ziffr/core/types";

type VersionType = "widget" | "dashboard" | "deck" | "metric" | "template" | "theme" | "workflow" | "snapshot";
type Row = Awaited<ReturnType<typeof listVersions>>["versions"][number];

export function VersionsPanel({ type, id, people, onRestored }: { type: VersionType; id: number; people: Profile[]; onRestored?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [name, setName] = useState("");
  const [naming, setNaming] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const load = () => listVersions(type, id).then((r) => { setRows(r.versions); setCanRestore(r.canRestore); }).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = (pid: string | null) => people.find((p) => p.id === pid)?.name.split(" ")[0] ?? "Someone";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 font-semibold"><History aria-hidden className="size-4" /> Versions</div>
      {canRestore && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await saveNamedVersion(type, id, name);
              setName("");
              toast.success("Named version saved");
              await load();
            });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this state, e.g. Board pack Q3, final" aria-label="Version name" />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Tag aria-hidden /> Save</Button>
        </form>
      )}
      {!rows ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No versions yet. The first change creates one.</p>
      ) : (
        <ol className="max-h-[50vh] space-y-1 overflow-y-auto">
          {rows.map((v, i) => (
            <li key={v.id} className="rounded-[var(--radius-input)] border border-border p-2.5">
              <div className="flex items-baseline gap-2">
                <span className="fig text-xs text-muted-foreground">v{v.version}</span>
                <span className="font-medium">{v.name ?? v.message ?? (i === 0 ? "Current" : "Edited")}</span>
                <span className="ml-auto text-xs text-muted-foreground">{who(v.author)}, <RelativeTime at={v.at} /></span>
              </div>
              {v.changes.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{v.changes.join("; ")}</p>}
              {canRestore && (
                <div className="mt-1.5 flex gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => {
                        try {
                          await restoreVersion(v.id);
                          toast.success(`Restored version ${v.version}`, { description: "Restoring adds a new version, so nothing is lost." });
                          await load();
                          onRestored?.();
                        } catch (err) {
                          toast.error("Not restored", { description: (err as Error).message });
                        }
                      })}
                      className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs hover:bg-muted"
                    >
                      <RotateCcw aria-hidden className="size-3.5" /> Restore
                    </button>
                  )}
                  {naming === v.id ? (
                    <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); const n = String(new FormData(e.currentTarget).get("n") ?? ""); start(async () => { await nameVersion(v.id, n); setNaming(null); await load(); }); }}>
                      <Input name="n" defaultValue={v.name ?? ""} autoFocus aria-label="Name" className="h-8 text-xs" />
                      <Button type="submit" size="sm">Save</Button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setNaming(v.id)} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Tag aria-hidden className="size-3.5" /> {v.name ? "Rename" : "Name"}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
