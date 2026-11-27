// Which screens a phone has to do well (spec 0055; GLOSSARY: Route Tier): the one table of every page in apps/web/src/app.
// The phone viewport check and anything that speaks about a screen on a phone read it, so there is one source. A tier never
// hides a page or changes who may see it. Pure data: client components may import it. A new page is added here with its
// page.tsx; route-tiers.test.ts fails until it is. A Desktop-first page also has its words in the core's
// desktop-screens.ts, which the same test holds to this table.

/** Phone-first is designed for a thumb and checked in CI; Phone-OK reads and does the common change on a phone; Desktop-first is made for a larger screen. */
export type RouteTier = "phone-first" | "phone-ok" | "desktop-first";

/** Every page by its route (the folder under apps/web/src/app, "/" for the home page) and its tier. */
export const ROUTE_TIERS = {
  // Dashboards, and the pages others get a link to.
  "/": "phone-first",
  "/dashboards": "phone-first",
  "/dashboards/[id]": "phone-first",
  "/dashboards/[id]/present": "phone-first",
  "/dashboards/[id]/snapshots/[sid]": "phone-first",
  "/v/open/[key]": "phone-first",
  "/gallery": "phone-first",
  "/stories": "phone-first",
  "/stories/[id]": "phone-first",
  // A quick look, and recording a value.
  "/metrics": "phone-first",
  "/metrics/[slug]": "phone-first",
  "/metrics/[slug]/[period]": "phone-first",
  "/submit/[code]": "phone-first",
  "/submit/all/[code]": "phone-first",
  "/schedule/submit/[slug]": "phone-first",
  "/paste-values": "phone-first",
  // What waits for a person.
  "/schedule": "phone-first",
  "/actions": "phone-first",
  "/actions/[id]": "phone-first",
  "/actions/share/[id]": "phone-first",
  // Getting in.
  "/login": "phone-first",
  "/invite/[token]": "phone-first",
  "/welcome": "phone-first",
  "/first-steps": "phone-first",
  "/setup": "phone-first",
  "/try": "phone-first",
  "/try/start": "phone-first",
  "/demo/confirm": "phone-first",
  "/oauth/authorize": "phone-first",

  "/settings": "phone-ok",
  "/settings/alerts": "phone-ok",
  "/settings/appearance": "phone-ok",
  "/settings/assistants": "phone-ok",
  "/settings/deliveries": "phone-ok",
  "/settings/export": "phone-ok",
  "/settings/feeds": "phone-ok",
  "/settings/keys": "phone-ok",
  "/settings/library": "phone-ok",
  "/settings/profile": "phone-ok",
  "/settings/schedule": "phone-ok",
  "/settings/size/make-room": "phone-ok",
  "/settings/tags": "phone-ok",
  "/settings/usage": "phone-ok",
  "/settings/webhooks": "phone-ok",
  "/settings/workspace": "phone-ok",
  "/settings/your-webhooks": "phone-ok",
  "/installation/users": "phone-ok",
  "/installation/workspaces": "phone-ok",
  "/installation/health": "phone-ok",
  "/team": "phone-ok",
  "/audit": "phone-ok",
  "/changes": "phone-ok",
  "/connectors/outbox": "phone-ok",
  "/sources": "phone-ok",
  "/decks": "phone-ok",
  "/decks/[id]/present": "phone-ok",
  "/guide": "phone-ok",
  "/guide/[chapter]": "phone-ok",
  "/themes": "phone-ok",
  "/try/n8n": "phone-ok",

  "/decks/[id]": "desktop-first",
  "/workflows": "desktop-first",
  "/connectors": "desktop-first",
  "/connectors/send": "desktop-first",
  "/connectors/sources": "desktop-first",
  "/connectors/who-gets-what": "desktop-first",
  "/settings/packs": "desktop-first",
  "/settings/library/playground": "desktop-first",
  "/installation": "desktop-first",
  "/installation/feedback": "desktop-first",
  "/analyze": "desktop-first",
  "/metrics/new": "desktop-first",
  "/welcome/import": "desktop-first",
  "/welcome/import/[id]": "desktop-first",
} as const satisfies Record<string, RouteTier>;
