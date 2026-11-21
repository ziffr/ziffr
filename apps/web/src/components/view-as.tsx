"use client";
import { useTransition } from "react";
import { setViewer } from "@/app/actions";
import type { Profile } from "@ziffr/core/types";

// The Workspace Role, not the job title (GLOSSARY: Role): a visitor sees what an Owner, Admin, Member and Guest each get.
const ROLE_NAMES: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export function ViewAs({ profiles, current, roles }: { profiles: Profile[]; current: string; roles: Record<string, string> }) {
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
            {p.name.split(" ")[0]}, {roles[p.id] ? ROLE_NAMES[roles[p.id]] ?? roles[p.id] : p.role.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
