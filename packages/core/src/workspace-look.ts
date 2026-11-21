// The Theme outside the app, read for a Workspace (GLOSSARY: Theme; ticket #542): its default Theme's look and its
// name. Internal use by the senders and the public pages, which have no Actor: they pass only a workspace id that
// something already proved (a queued Delivery, a Token, a View Link), and what comes back is the small ThemeLook, never
// the Theme row. A Workspace with no Theme, or one that cannot be read, gets Ziffr's neutral look, never an error.
import { db } from "./db";
import { themeLook, type ThemeLook } from "./theme-look";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { STARTER_THEME } from "./themes";
import type { Theme } from "./types";

/** The look of a Workspace's default Theme, with its name. `themeId` picks another Theme of that Workspace (a
 * dashboard's own), falling back to the default. */
export async function workspaceLook(workspaceId: string, themeId?: number | null): Promise<ThemeLook> {
  const [{ data: ws }, { data: themes }] = await Promise.all([
    db().from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    db().from("themes").select("id, tokens, slides, is_default").eq("workspace_id", workspaceId),
  ]);
  const rows = (themes ?? []) as Pick<Theme, "id" | "tokens" | "slides" | "is_default">[];
  const row = rows.find((t) => themeId != null && t.id === themeId) ?? rows.find((t) => t.is_default);
  // Checked again on the way out: whatever is stored, only valid colours, fonts and pictures leave.
  const tokens = row ? cleanTokens(row.tokens) : null;
  return themeLook(row && tokens ? { tokens, slides: cleanSlides(row.slides) } : STARTER_THEME, String(ws?.name ?? ""));
}
