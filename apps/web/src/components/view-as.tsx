"use client";
import { useTransition } from "react";
import { setViewer } from "@/app/actions";
import type { Profile } from "@/lib/types";

export function ViewAs({ profiles, current }: { profiles: Profile[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Viewing as</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setViewer(e.target.value))}
        className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 font-medium"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name.split(" ")[0]}, {p.role.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
