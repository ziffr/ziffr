"use client";
// The consent screen's form (spec 0023, GLOSSARY: Access Key): who is asking, as the assistant names itself and
// where it sends the person back, then the Workspace, what it may do (only reading ticked to begin with) and until
// when. The assistant's name is its own claim, shown as text, never as a link or markup.
import { useActionState, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Scope } from "@ziffr/core/actor";
import { CREATING_SCOPES, SCOPES } from "@ziffr/core/actor";
import { answerConsent, type ConsentState } from "./actions";

const SCOPE_LABEL: Record<Scope, string> = { "metrics:read": "Read metrics and their values", "values:submit": "Submit values", "metrics:write": "Create metrics", "metrics:edit": "Change metrics", "dashboards:read": "Read dashboards", "dashboards:write": "Build dashboards", "alerts:write": "Manage alerts" };
/** What a scope covers, where its label alone does not say. */
const SCOPE_HINT: Partial<Record<Scope, string>> = { "metrics:edit": "targets, Target Series, Projections, the Unusual Value check, how values come in and who sends them, for the Metrics you own or edit" };
const READING: Scope[] = ["metrics:read", "dashboards:read"];

/** The form; the server checks everything again. */
export function ConsentForm({ request, clientName, returnHost, onThisComputer, workspaces, currentWorkspace, requested, endsOn, latest }: {
  request: string; clientName: string; returnHost: string; onThisComputer: boolean;
  workspaces: { id: string; name: string; canCreate: boolean }[]; currentWorkspace: string; requested: Scope[]; endsOn: string; latest: string;
}) {
  const [state, act, pending] = useActionState<ConsentState, FormData>(answerConsent, { error: null });
  const [workspace, setWorkspace] = useState(workspaces.some((w) => w.id === currentWorkspace) ? currentWorkspace : workspaces[0]?.id ?? "");
  const canCreate = workspaces.find((w) => w.id === workspace)?.canCreate ?? false;
  // Only reading is ticked at first, even when the assistant asked for more: writing is the person's own choice.
  const first = requested.filter((s) => READING.includes(s));
  const [scopes, setScopes] = useState<Scope[]>(first.length ? first : ["metrics:read"]);
  const shown = SCOPES.filter((s) => canCreate || !CREATING_SCOPES.includes(s));
  if (!workspaces.length) return <p className="mx-auto mt-16 max-w-md text-sm text-muted-foreground">You have no workspace of your own to connect an assistant to yet.</p>;
  return (
    <form action={act} className="mx-auto mt-12 max-w-md space-y-5">
      <input type="hidden" name="request" value={request} />
      <div>
        <h1 className="text-[length:var(--text-2xl)] leading-tight">Connect an assistant to Ziffr?</h1>
        <p className="mt-2 text-sm">
          An assistant that <em>says it is</em> <strong className="break-words">“{clientName}”</strong> asks to work in Ziffr for you. It will see no more than you do, and only what you allow here.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">After you answer, you go back to <strong className="text-foreground">{returnHost}</strong>. Connect only if you started this from that assistant just now.</p>
        {onThisComputer && <p className="mt-2 rounded-[var(--radius-input)] border border-border p-2 text-sm">This assistant runs on your own computer. Any program there can claim its name: connect only if you started it yourself.</p>}
      </div>
      <label className="block text-sm">
        <span className="text-xs text-muted-foreground">Workspace</span>
        <select name="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="mt-1 block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">It may</legend>
        {shown.map((s) => (
          <label key={s} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="scope" value={s} checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
            <span>
              {SCOPE_LABEL[s]}
              {/* On a line of its own, so the label never wraps beside it. */}
              {SCOPE_HINT[s] && <span className="block text-xs text-muted-foreground">{SCOPE_HINT[s]}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col text-xs text-muted-foreground">Until (the end of this day, UTC)<Input type="date" name="ends_on" defaultValue={endsOn} max={latest} className="mt-1 w-44" /></label>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="answer" value="allow" disabled={pending || !scopes.length} className={buttonVariants()}>Connect</button>
        <button type="submit" name="answer" value="deny" disabled={pending} className={buttonVariants({ variant: "outline" })}>Cancel</button>
      </div>
      <p className="text-xs text-muted-foreground">You can disconnect it at any time under Settings, Connected assistants.</p>
    </form>
  );
}
