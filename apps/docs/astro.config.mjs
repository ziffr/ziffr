// docs.ziffr.net (ticket #551): Starlight over the repository's own docs, which scripts/sync.mjs copies in before
// every build. One build per channel: the release (docs.ziffr.net) and main ("next"), told apart by DOCS_CHANNEL.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";
import starlightLinksValidator from "starlight-links-validator";

const next = process.env.DOCS_CHANNEL === "next";
const site = process.env.DOCS_SITE ?? "https://docs.ziffr.net";

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: next ? "Ziffr docs (next)" : "Ziffr docs",
      description: next ? "What is coming in Ziffr: the docs of the main branch." : "Docs for people who use, run and build on Ziffr.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/ziffr/ziffr" }],
      // The "next" view shows work that may change; it should not compete with the release docs in search engines.
      head: next ? [{ tag: "meta", attrs: { name: "robots", content: "noindex" } }] : [],
      plugins: [
        // Fails the build on a broken internal link or anchor, which is the CI check for the site.
        starlightLinksValidator({ errorOnRelativeLinks: false, errorOnLocalLinks: false }),
        // The API reference comes from the OpenAPI document the app builds (scripts/openapi.mjs), never written by hand.
        starlightOpenAPI([{ base: "api/reference", label: "API reference", schema: "./generated/openapi.json" }]),
      ],
      // Every folder the sync fills is a sidebar group, so no page can be left out of the sidebar.
      sidebar: [
        { label: "Getting started", items: [{ autogenerate: { directory: "getting-started" } }] },
        { label: "User guide", items: [{ autogenerate: { directory: "user-guide" } }] },
        { label: "Self-hosting", items: [{ autogenerate: { directory: "self-hosting" } }] },
        { label: "API", items: [{ label: "Guide", items: [{ autogenerate: { directory: "api" } }] }, ...openAPISidebarGroups] },
        { label: "SDK", items: [{ autogenerate: { directory: "sdk" } }] },
        { label: "MCP", items: [{ autogenerate: { directory: "mcp" } }] },
        { label: "Feeds", items: [{ autogenerate: { directory: "feeds" } }] },
        { label: "Webhooks and templates", items: [{ autogenerate: { directory: "webhooks" } }] },
        { label: "Packs and Themes", items: [{ autogenerate: { directory: "packs-and-themes" } }] },
        { label: "Contributing", items: [{ autogenerate: { directory: "contributing" } }] },
      ],
    }),
  ],
});
