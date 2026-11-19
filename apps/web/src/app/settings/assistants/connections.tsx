"use client";
// The list under Connected assistants (spec 0023, GLOSSARY: Access Key): one row per assistant the person connected,
// with its Workspace, what it may do, when it was made, last used and ends, and Disconnect.
import { useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { disconnectAssistant } from "@/app/assistant-actions";
import type { MyConnection } from "@ziffr/core/assistant-connections";
import type { Scope } from "@ziffr/core/actor";
import { formatDate } from "@ziffr/core/format";

const SCOPE_LABEL: Record<Scope, string> = { "metrics:read": "Read metrics", "values:submit": "Submit values", "metrics:write": "Create metrics", "metrics:edit": "Change metrics", "dashboards:read": "Read dashboards", "dashboards:write": "Build dashboards" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** The person's connections; the core checks each Disconnect again. */
export function Connections({ connections, address }: { connections: MyConnection[]; address: string | null }) {
  const [pending, start] = useTransition();
  const disconnect = (c: MyConnection) => start(async () => {
    try { unwrap(await disconnectAssistant(c.id)); toast.success(`${c.name} disconnected`); } catch (e) { toast.error("Not done", { description: shown(e) }); }
  });
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Assistants such as Claude.ai that you connected to Ziffr by its address. Each works in one workspace, does only what you allowed, and stops when you disconnect it, when it ends, or when you leave the workspace.
        {address ? <> To connect one, add <span className="font-mono text-foreground">{address}</span> as a connector in the assistant.</> : " This Ziffr does not offer connections to assistants."}
      </p>
      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assistant is connected.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              {/* The name is what the assistant called itself when it registered. */}
              <span className="font-medium break-words">{c.name}</span>
              <span className="text-muted-foreground">{c.workspaceName}</span>
              <span className="text-muted-foreground">{c.scopes.map((s) => SCOPE_LABEL[s as Scope] ?? s).join(", ")}</span>
              <span className="text-muted-foreground">connected {formatDate(c.createdAt.slice(0, 10))}</span>
              <span className="text-muted-foreground">{c.lastUsedAt ? `last used ${when(c.lastUsedAt)}` : "not used yet"}</span>
              <span className="text-muted-foreground">until {formatDate(c.expiresOn)}</span>
              <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={pending} onClick={() => disconnect(c)} aria-label={`Disconnect ${c.name}`}>Disconnect</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
