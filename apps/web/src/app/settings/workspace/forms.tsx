"use client";
// The workspace's name and its Workspace Profile (spec 0006, tickets #96 and #97; GLOSSARY: Workspace Profile). The
// lists come from the core, which checks every value again on the server.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameWorkspace, setWorkspaceProfile } from "@/app/settings-actions";
import {
  currencyFor, EMPLOYEE_BANDS, INDUSTRIES, INDUSTRY_LABEL, REVENUE_BANDS, REVENUE_LABEL, SEGMENTS, SEGMENT_LABEL,
  type WorkspaceProfile,
} from "@ziffr/core/workspace-profile";

const field = "mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-normal disabled:opacity-70";
const save = async (f: () => Promise<unknown>) => {
  try { unwrap(await f()); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); }
};

/** The workspace's name, with a form for Owners and Admins. */
export function WorkspaceNameForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  return (
    <section aria-labelledby="name-heading" className="space-y-3">
      <h2 id="name-heading" className="font-medium">Name</h2>
      {canEdit ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(() => save(() => renameWorkspace(n))); }}>
          <label className="min-w-0 flex-1 text-xs text-muted-foreground">Workspace name
            <Input value={n} onChange={(e) => setN(e.target.value)} maxLength={80} className="mt-1" />
          </label>
          <Button type="submit" variant="outline" disabled={pending || !n.trim() || n.trim() === name}>Save</Button>
        </form>
      ) : (
        <p className="text-sm">{name}</p>
      )}
    </section>
  );
}

/** A code from a list with the name it is shown by. */
export type Named = { code: string; name: string };

/** The Workspace Profile: what kind of business this is, picked from fixed lists. Country and currency names come
 * from the server, so the page the server draws and the one the browser takes over list them in the same order. */
export function WorkspaceProfileForm({ profile, canEdit, countries, currencies }: { profile: WorkspaceProfile; canEdit: boolean; countries: Named[]; currencies: Named[] }) {
  const [pending, start] = useTransition();
  const [p, setP] = useState(profile);
  const set = (k: keyof WorkspaceProfile, v: string) => setP((old) => {
    const next = { ...old, [k]: v || null } as WorkspaceProfile;
    // A new country proposes its own currency while none was picked, or the old one was the old country's.
    if (k === "country" && v && (!old.currency || old.currency === (old.country && currencyFor(old.country)))) next.currency = currencyFor(v);
    return next;
  });
  const changed = (Object.keys(p) as (keyof WorkspaceProfile)[]).some((k) => p[k] !== profile[k]);
  const select = (k: keyof WorkspaceProfile, label: string, options: { v: string; label: string }[], hint?: string) => (
    <label className="block text-sm font-medium">
      {label}
      {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      <select value={p[k] ?? ""} disabled={!canEdit || pending} onChange={(e) => set(k, e.target.value)} className={field}>
        <option value="">Not set</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <section aria-labelledby="profile-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="profile-heading" className="font-medium">Workspace Profile</h2>
        <p className="text-sm text-muted-foreground">What kind of business this is, so Ziffr can suggest the Metrics such teams track. Teams within the workspace are Groups, on Members and Groups.</p>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(() => save(() => setWorkspaceProfile(p))); }}>
        {select("industry", "Industry", INDUSTRIES.map((v) => ({ v, label: INDUSTRY_LABEL[v] })))}
        {select("segment", "Customers", SEGMENTS.map((v) => ({ v, label: SEGMENT_LABEL[v] })))}
        {select("country", "Country", countries.map(({ code, name }) => ({ v: code, label: name })))}
        {select("currency", "Currency", currencies.map(({ code, name }) => ({ v: code, label: `${code}, ${name}` })))}
        {select("employeeBand", "People", EMPLOYEE_BANDS.map((v) => ({ v, label: v === "1000+" ? "More than 1,000" : `${v.replace("-", " to ")}` })))}
        {select("revenueBand", "Revenue a year", REVENUE_BANDS.map((v) => ({ v, label: `${REVENUE_LABEL[v]}${p.currency ? ` ${p.currency}` : ""}` })), p.currency ? undefined : "In the workspace currency")}
        {canEdit && <Button type="submit" variant="outline" className="sm:col-span-2 sm:justify-self-start" disabled={pending || !changed}>Save</Button>}
      </form>
    </section>
  );
}
