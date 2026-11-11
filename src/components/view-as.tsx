"use client";
import { useTransition } from "react";
import { setViewer } from "@/app/actions";
import type { Profile } from "@/lib/types";

export function ViewAs({ profiles, current }: { profiles: Profile[]; current: string }) {
  const [pending, start] = useTransition();
  const me = profiles.find((p) => p.id === current);
  return (
    <label className="flex items-center gap-2 rounded-full border bg-background py-1 pr-1 pl-3 text-xs">
      <span className="text-muted-foreground">View as</span>
      <span className="size-2.5 rounded-full" style={{ background: me?.color }} />
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setViewer(e.target.value))}
        className="rounded-full bg-transparent py-0.5 pr-1 font-medium outline-none"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name.split(" ")[0]} ({p.role})
          </option>
        ))}
      </select>
    </label>
  );
}
