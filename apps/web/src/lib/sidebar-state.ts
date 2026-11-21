// The sidebar (docs/specs/0036-app-layout.md): reads on the server whether this browser left it collapsed to icons.
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE } from "@/lib/layout-cookie";

/** Whether the sidebar was left collapsed to icons. */
export async function sidebarCollapsed(): Promise<boolean> {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
}
