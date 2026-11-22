# @ziffr/docs

The docs site (docs.ziffr.net), built with [Starlight](https://starlight.astro.build) from the docs that already live in this repository. Nothing is copied by hand: `scripts/sync.mjs` reads `docs/user-guide`, `docs/guides`, `docs/automations`, the package READMEs and the contributing files on every build, adds titles, and turns relative links into site links (or GitHub links for source files). `scripts/openapi.mjs` writes the OpenAPI document that the API reference renders.

```sh skip="builds the docs site"
pnpm --filter @ziffr/docs dev      # sync, then a live site on http://localhost:4321
pnpm --filter @ziffr/docs build    # sync and build into apps/docs/dist; broken internal links fail it
```

A new file in one of those folders needs a line in the `pages` tables of `scripts/sync.mjs` to appear (user guide chapters and automation templates are picked up by their folder). `DOCS_CHANNEL=next` builds the "next" view (main); `.github/workflows/docs.yml` deploys both channels to Cloudflare Pages.
