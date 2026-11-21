"use client";
// Your Appearance (#505): four choices drawn as small previews. The choice applies at once and is saved when picked.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { setAppearance } from "@/app/settings-actions";
import { APPEARANCES, APPEARANCE_WORDS, type Appearance } from "@ziffr/core/appearance";
import { cn } from "@/lib/utils";

/** A miniature page in the look a choice stands for; System shows half light, half dark. Drawn with fixed colours on purpose: it shows the other looks whatever the page is drawn in. */
const PREVIEWS: Record<Appearance, { bg: string; card: string; ink: string; line: string }> = {
  system: { bg: "#f5f1ee", card: "#fdfbf8", ink: "#2a2420", line: "#d9d2cb" },
  light: { bg: "#f5f1ee", card: "#fdfbf8", ink: "#2a2420", line: "#d9d2cb" },
  dark: { bg: "#1c1917", card: "#262220", ink: "#ece8e4", line: "#4a423d" },
  contrast: { bg: "#ffffff", card: "#ffffff", ink: "#000000", line: "#000000" },
};

function Preview({ choice }: { choice: Appearance }) {
  const draw = (p: (typeof PREVIEWS)[Appearance], clip?: string) => (
    <g clipPath={clip}>
      <rect width="120" height="72" fill={p.bg} />
      <rect x="10" y="10" width="100" height="52" rx="5" fill={p.card} stroke={p.line} strokeWidth={choice === "contrast" ? 2 : 1} />
      <rect x="18" y="18" width="40" height="6" rx="2" fill={p.ink} />
      <rect x="18" y="30" width="84" height="4" rx="2" fill={p.ink} opacity="0.55" />
      <polyline points="18,54 40,44 62,50 84,38 102,42" fill="none" stroke={p.ink} strokeWidth="2" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 72" aria-hidden className="h-auto w-full rounded-[var(--radius-input)]">
      {choice === "system" ? (
        <>
          <defs><clipPath id="left"><rect width="60" height="72" /></clipPath><clipPath id="right"><rect x="60" width="60" height="72" /></clipPath></defs>
          {draw(PREVIEWS.light, "url(#left)")}
          {draw(PREVIEWS.dark, "url(#right)")}
        </>
      ) : draw(PREVIEWS[choice])}
    </svg>
  );
}

/** The four choices as a radio group; in the demo the choice stays in this browser. */
export function AppearanceForm({ current, demo }: { current: Appearance; demo: boolean }) {
  const [chosen, setChosen] = useState(current);
  const [pending, start] = useTransition();
  const pick = (next: Appearance) => {
    const before = chosen;
    setChosen(next);
    // The page changes at once; the server draws the same on the next load.
    document.documentElement.dataset.appearance = next;
    start(async () => {
      try { unwrap(await setAppearance(next)); } catch (err) {
        setChosen(before);
        document.documentElement.dataset.appearance = before;
        toast.error("Not saved", { description: shown(err) });
      }
    });
  };
  return (
    <div className="max-w-2xl space-y-4">
      <fieldset disabled={pending}>
        <legend className="text-sm font-medium">Look</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Look">
          {APPEARANCES.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={chosen === a}
              onClick={() => pick(a)}
              className={cn("rounded-[var(--radius-card)] border border-border p-2 text-left focus-visible:outline-2 focus-visible:outline-ring", chosen === a && "border-foreground ring-2 ring-foreground")}
            >
              <Preview choice={a} />
              <span className="mt-2 block text-sm font-medium">{APPEARANCE_WORDS[a].label}</span>
              <span className="block text-xs text-muted-foreground">{APPEARANCE_WORDS[a].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {demo ? "In the demo this stays in this browser." : "It is saved to you, so every device and Workspace you use looks the same."}{" "}
        Dashboards and Decks keep the look of their Theme.
      </p>
    </div>
  );
}
