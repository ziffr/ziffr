// Paints a page in a Workspace's look (GLOSSARY: Theme; ticket #542): its colours and fonts as the Theme has them, the
// accent (already readable on the surface) for buttons and focus. Used where only the look reached the browser.
import { lookTheme, onFill, type ThemeLook } from "@ziffr/core/theme-look";
import { ThemeScope } from "@/components/theme-scope";

/** The page's background, text, fonts and accent from the look; `children` are drawn in it. */
export function LookScope({ look, className, children }: { look: ThemeLook; className?: string; children: React.ReactNode }) {
  return (
    <ThemeScope
      theme={lookTheme(look)}
      scheme="designed" // a shared page keeps the look it was shared with, whatever the viewer's Appearance (#583)
      className={className}
      style={{ background: look.canvas, ["--primary" as string]: look.accent, ["--primary-foreground" as string]: onFill(look.accent), ["--ring" as string]: look.accent, ["--color-accent" as string]: look.accent, ["--color-focus" as string]: look.accent, ["--color-board" as string]: look.accent, ["--color-board-type" as string]: onFill(look.accent) }}
    >
      {children}
    </ThemeScope>
  );
}
