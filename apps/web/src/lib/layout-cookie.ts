// The app layout (docs/specs/0036-app-layout.md): which frame the app is drawn in. A cookie of the browser, set
// from Your profile or by `?layout=` (middleware.ts); without it the sidebar. It holds a preference and nothing about who may see what.

/** Cookie naming the layout: `top` is the classic top bar (kept for one release, #511); anything else, or none, is the sidebar. */
export const LAYOUT_COOKIE = "ziffr-layout";

/** Cookie remembering whether the sidebar is collapsed to icons (`collapsed`). */
export const SIDEBAR_COOKIE = "ziffr-sidebar";

/** The layouts a person can choose. */
export type Layout = "top" | "sidebar";

/** The layout a cookie value stands for; anything but `top` is the sidebar. */
export function parseLayout(value: string | undefined | null): Layout {
  return value === "top" ? "top" : "sidebar";
}
