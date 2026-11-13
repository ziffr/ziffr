"use client";
// Paints its children in a theme (GLOSSARY: Theme) and loads the theme's fonts once.
import { createContext, useContext, useEffect } from "react";
import { fontHrefs, themeVars } from "@/lib/themes";
import type { Theme } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The theme around a piece of content, for things that render elsewhere (dialogs) but should look the same. */
const ThemeCtx = createContext<Theme | undefined>(undefined);
export const useContentTheme = () => useContext(ThemeCtx);

export function useThemeFonts(theme: Theme | undefined) {
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

export function ThemeScope({ theme, className, children, ref, ...rest }: { theme: Theme | undefined; className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> } & React.HTMLAttributes<HTMLDivElement>) {
  useThemeFonts(theme);
  return (
    <div {...rest} ref={ref} data-theme-id={theme?.id} className={cn("themed", className)} style={{ ...(theme ? themeVars(theme.tokens) : {}), ...rest.style }}>
      <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
    </div>
  );
}
