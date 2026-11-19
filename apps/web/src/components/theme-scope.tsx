"use client";
// Paints its children in a theme (GLOSSARY: Theme) and loads the theme's fonts once.
import { useEffect } from "react";
import { fontHrefs, themeVars } from "@ziffr/core/themes";
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

/** Paints its children in the theme's colours and fonts. */
export function ThemeScope({ theme, className, children, ref, ...rest }: { theme: Theme | undefined; className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> } & React.HTMLAttributes<HTMLDivElement>) {
  useThemeFonts(theme);
  return (
    <div {...rest} ref={ref} data-theme-id={theme?.id} className={cn("themed", className)} style={{ ...(theme ? themeVars(theme.tokens) : {}), ...rest.style }}>
      {children}
    </div>
  );
}
