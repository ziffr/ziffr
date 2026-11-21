// The layout preview (docs/specs/0036-app-layout.md): reads the browser's choice on the server.
import { cookies } from "next/headers";
import { LAYOUT_COOKIE, parseLayout, SIDEBAR_COOKIE, type Layout } from "@/lib/layout-cookie";

/** Which layout this browser asked for; the top bar unless it chose the preview. */
export async function layoutChoice(): Promise<Layout> {
  return parseLayout((await cookies()).get(LAYOUT_COOKIE)?.value);
}

/** Whether the sidebar was left collapsed to icons. */
export async function sidebarCollapsed(): Promise<boolean> {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
}
