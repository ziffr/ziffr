// The Workspace's name and logo in its Theme's accent (GLOSSARY: Theme; ticket #542), on the pages people open without
// signing in: the form link and View Links. A self-contained strip: its own surface and text colours, both checked for
// contrast when the look was made (theme-look.ts), so it reads on any page behind it. The logo is the Workspace's own
// uploaded picture, drawn as an image (never inline markup), so nothing in it can run.
import type { ThemeLook } from "@ziffr/core/theme-look";

/** The brand strip (smaller when `compact`): a bar in the accent, the logo (or the Workspace's name), and the Theme's footer line when `footer`. */
export function BrandBar({ look, footer = false, compact = false, className }: { look: ThemeLook; footer?: boolean; compact?: boolean; className?: string }) {
  const height = Math.max(16, Math.min(compact ? 28 : 48, Math.round(Math.min(look.logoWidth, 200) / look.logoRatio)));
  return (
    <div className={className} style={{ background: look.surface, color: look.ink, border: `1px solid ${look.rule}`, borderTop: `4px solid ${look.accent}`, borderRadius: 8 }}>
      <div className={compact ? "flex items-center gap-2 px-3 py-1" : "flex items-center gap-3 px-4 py-3"}>
        {look.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- an inline picture the Workspace uploaded; there is nothing to optimise
          <img src={look.logo} alt={look.name} style={{ height, width: "auto", maxWidth: 200 }} />
        ) : (
          <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"} style={{ fontFamily: "var(--font-heading)" }}>{look.name}</span>
        )}
        {look.logo && <span className="sr-only">{look.name}</span>}
      </div>
      {footer && look.footer && <p className="px-4 pb-3 text-xs" style={{ color: look.muted }}>{look.footer}</p>}
    </div>
  );
}
