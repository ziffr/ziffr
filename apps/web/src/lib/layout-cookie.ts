// The layout preview (docs/specs/0036-app-layout.md): which frame the app is drawn in. A cookie of the browser, set
// from Your profile or by `?layout=` (middleware.ts). It holds a preference and nothing about who may see what.

/** Cookie naming the layout: `sidebar` for the preview, anything else is today's top bar. */
export const LAYOUT_COOKIE = "ziffr-layout";

/** Cookie remembering whether the sidebar is collapsed to icons (`collapsed`). */
export const SIDEBAR_COOKIE = "ziffr-sidebar";

/** The layouts a person can choose. */
export type Layout = "top" | "sidebar";

/** The layout a cookie value stands for; anything unknown is the top bar. */
export function parseLayout(value: string | undefined | null): Layout {
  return value === "sidebar" ? "sidebar" : "top";
}
