"use client";
// Picks the theme of one dashboard or deck (GLOSSARY: Theme). Empty means the team default.
import Link from "next/link";
import { useTransition } from "react";
import { Palette } from "lucide-react";
import type { Theme } from "@/lib/types";

export function ThemePicker({ themes, value, onChange, disabled }: { themes: Theme[]; value: number | null; onChange: (id: number | null) => Promise<unknown>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const def = themes.find((t) => t.is_default);
  return (
    <span className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5">
        <Palette aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Theme</span>
        <select
          value={value ?? ""}
          disabled={disabled || pending}
          onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; start(async () => { await onChange(v); }); }}
          className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2"
        >
          <option value="">{def ? `${def.name} (team default)` : "Team default"}</option>
          {themes.filter((t) => !t.is_default).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <Link href="/themes" className="text-sm underline">Themes</Link>
    </span>
  );
}
