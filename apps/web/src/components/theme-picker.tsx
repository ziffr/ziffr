"use client";
// Picks the theme of one dashboard or deck (GLOSSARY: Theme). Empty means the team default.
import Link from "next/link";
import { useTransition } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { themeLogoSource } from "@/app/theme-actions";
import { useConfirm } from "@/components/confirm-dialog";
import { shown, unwrap } from "@/lib/action-error";
import type { Theme } from "@ziffr/core/types";

/** `onChange` saves the pick; a refusal it answers is shown in a toast. A Theme that shows a Pack's logo asks whose it is
 * first, as "Make team default" does (spec 0039), through the same core call. */
export function ThemePicker({ themes, value, onChange, disabled }: { themes: Theme[]; value: number | null; onChange: (id: number | null) => Promise<unknown>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const def = themes.find((t) => t.is_default);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <label className="flex min-w-0 items-center gap-1.5">
        <Palette aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Theme</span>
        <select
          value={value ?? ""}
          disabled={disabled || pending}
          onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; start(async () => { try {
            const from = v === null ? null : unwrap(await themeLogoSource(v));
            if (from && !(await confirm({ title: `Use ${themes.find((t) => t.id === v)?.name ?? "this Theme"}?`, description: `This Theme shows ${from.author || "the author"}\u2019s logo, from the Pack ${from.pack}. It will show wherever this is drawn, in presentations and View Links too.`, confirmLabel: "Use this Theme", destructive: false }))) return;
            unwrap(await onChange(v)); } catch (err) { toast.error("Theme not changed", { description: shown(err) }); } }); }}
          className="h-9 min-w-0 rounded-[var(--radius-input)] border border-input bg-card px-2 max-md:h-11 max-md:text-base pointer-coarse:h-11 pointer-coarse:text-base"
        >
          <option value="">{def ? `${def.name} (team default)` : "Team default"}</option>
          {themes.filter((t) => !t.is_default).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      {dialog}
      <Link href="/themes" className="inline-flex items-center text-sm underline max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11">Themes</Link>
    </span>
  );
}
