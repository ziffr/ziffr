"use client";
// The signed-in person's corner of the header (ADR 0003): which workspace they are in, switching, signing out.
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut, switchWorkspace } from "@/app/auth-actions";

export function AccountMenu({ name, workspaces, current }: { name: string; workspaces: { id: string; name: string }[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2 text-sm">
      {workspaces.length > 1 ? (
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Workspace</span>
          <select value={current} disabled={pending} onChange={(e) => start(() => switchWorkspace(e.target.value))} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2">
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
      ) : (
        <span className="text-muted-foreground">{workspaces[0]?.name}</span>
      )}
      <span className="font-medium">{name}</span>
      <button type="button" disabled={pending} onClick={() => start(() => signOut())} className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Sign out" title="Sign out">
        <LogOut aria-hidden className="size-4" />
      </button>
    </span>
  );
}
