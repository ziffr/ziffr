"use client";
// Paints its children in a theme (GLOSSARY: Theme) and loads the theme's fonts once.
import { useEffect } from "react";
import { fontHrefs, isDark, themeVars } from "@ziffr/core/themes";
import { darkOf, followsAppearance } from "@ziffr/core/theme-dark";
import type { Theme } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

/** Adds the theme's font stylesheets to the page, each once. */
function useThemeFonts(theme: Theme | undefined) {
  useEffect(() => {
    if (!theme) return;
    for (const href of fontHrefs(theme.tokens)) {
      if (document.head.querySelector(`link[data-theme-font="${CSS.escape(href)}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.dataset.themeFont = href;
      document.head.appendChild(l);
    }
  }, [theme]);
}

/** How a Theme is drawn (#583): "follow" goes dark with the viewer's Appearance if the Theme says so (the default);
 * "designed" is always as designed: for what must look as it was made or shared (Snapshots, View Links); "dark" forces
 * the dark variant (the Theme editor's preview). */
export type ThemeScheme = "follow" | "designed" | "dark";

/** Paints its children in the theme's colours and fonts. */
export function ThemeScope({ theme, scheme = "follow", className, children, ref, ...rest }: { theme: Theme | undefined; scheme?: ThemeScheme; className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> } & React.HTMLAttributes<HTMLDivElement>) {
  useThemeFonts(theme);
  const dark = theme && scheme !== "designed" && (scheme === "dark" || followsAppearance(theme.tokens)) ? darkOf(theme.tokens) : null;
  // Where the Theme does not go dark with the viewer, the scope says which scheme its own colours are, so form controls
  // and scrollbars inside it match them; where it follows, the scope inherits the page's scheme (appearance.css).
  return (
    <div {...rest} ref={ref} data-theme-id={theme?.id} className={cn("themed", className)} style={{ ...(theme ? themeVars(theme.tokens, dark?.colours) : {}), ...(theme ? { colorScheme: dark ? (scheme === "dark" ? "dark" : undefined) : isDark(theme.tokens) ? "dark" : "light" } : {}), ...rest.style }}>
      {children}
    </div>
  );
}
