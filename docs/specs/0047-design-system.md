# 0047 Design system: one look for the app, the website, emails and decks

**Status:** draft. **Ticket:** to be opened with the owner's go-ahead (tracking issue, label `tracking`; sub-issues labelled `spec:0047`).

## Problem Statement

Ziffr has the start of a look (the Z mark, the "Coral" tokens in `apps/web/src/app/tokens.css`) but no design system. The colours, type and spacing live only as CSS in the app; the mark has no wordmark; emails take their colours from a Workspace's Theme and fall back to values that were chosen separately; and a marketing website has nothing to build from. The app's current look is warm and tactile (cotton and felt textures, cast shadows, a wine-coloured error red). It is pleasant but reads as crafted rather than as a business tool, and its figures and chips are small and low in contrast.

The owner's decision (2026-11-22): Ziffr should look **classy, clearly business-focused and modern**, and one system should serve the app, the marketing website, emails and decks. After comparing three drawn directions on the real demo (Quiet Paper, Ledger, Boardroom), the owner chose **Boardroom**.

## Solution

1. **The direction: Boardroom.** A dark ink sidebar frames the page; white cards with a hairline and soft depth sit on a warm canvas; 12px corners; a clean grotesque for text and figures; coral on the data line and highlights, never as a large fill. The Z mark and its colours (board `#1f1917`, paper `#f8f4f1`, coral `#ef8b7b`) are unchanged. The cotton and felt textures and the cast shadows go.
2. **One source of truth for tokens.** A small package holds colours, type, spacing, radius, shadow and motion as plain JSON, and a script generates every consumer's format from it, so the app, the website and email cannot drift apart.
3. **A brand guide** on the docs site: mark and wordmark, clear space, colour with contrast checks, type, chart palette, voice, and the few components that carry the look.
4. **Rolled out in order:** the app, then the Standard Themes (Ziffr Light and Ziffr Dark) and the email layout, then the website.

Ziffr's own screens are drawn by the person's Appearance, not by a Theme (GLOSSARY: Theme). That stays. A Workspace's Themes remain the customer's look for what they share; this spec changes what Ziffr itself looks like, and the two Standard Themes that carry Ziffr's own look into dashboards and decks.

## User Stories

1. As the owner, I want the app to look classy, business-focused and modern, so that a finance lead or a founder takes it seriously on first sight.
2. As the owner, I want the website, emails and decks to look like the same company as the app, so that a person moving from one to the other never doubts where they are.
3. As a developer or agent, I want one place to read a colour, a size or a radius and one command to regenerate every consumer, so that I never copy a value by hand.
4. As a person reading a status, I want good and bad to be told apart by shape, word and lightness as well as colour, so that nobody misses "Too high" (spec 0036's rule on colour, kept).
5. As a self-hoster or Workspace Owner, I want my Theme, logo and Appearance choices to keep working exactly as before, so that nothing I set up changes under me.
6. As a person who uses the app in the dark, I want a designed dark Appearance, not an inverted one, so that it is as calm as the light one.
7. As a person with a screen reader or low vision, I want text and controls to meet WCAG AA, checked by a test, so that the look never costs access.

## Implementation Decisions

### Tokens

- **A package, `packages/design-tokens`**, with the tokens in one JSON file in the shape of the W3C Design Tokens format, in layers: _primitive_ (the raw ramp: `ink`, `paper`, `coral`, neutrals, status colours), _semantic_ (`surface`, `canvas`, `text`, `text-muted`, `line`, `accent`, `good`, `bad`, `band`, `data-1..6`) and _component_ only where a component truly needs its own (sidebar, chip). Components use semantic names; they never use a primitive.
- **Generated outputs, never edited by hand** (like the reference docs):
  - `tokens.css` for the app and the website: custom properties in `oklch()` with sRGB fallbacks, a light set and a dark set under the same Appearance switch the app already has.
  - **Email values:** plain sRGB hex and a web-safe font stack only, because mail clients ignore `oklch()`, custom properties and web fonts (the email layout already assumes this; it reads these values instead of its own).
  - **The two Standard Themes** (`ziffr.theme/1` files) for Ziffr Light and Ziffr Dark.
  - The data the brand guide page draws its swatches from.
- **Checks in the package's tests:** every text/surface pair at least 4.5 to 1; every data colour at least 3 to 1 on `surface`; Good and Bad differ in lightness as well as hue, tested with a red-blindness and green-blindness simulation (the same bar `docs/guides/themes.md` states for Themes); the sRGB fallback of every `oklch()` value stays within a stated distance of it.
- **Published to npm** like the other packages for programs, as `@ziffr/design-tokens`, so the website (and anyone else) pins a version.
- **Licence:** the tokens are MIT. The brand files (the Z mark and the wordmark) sit in a folder of the package with a trademark note: the licence covers the tokens, not the Ziffr name or mark, and the brand guide says so.

### Look

- **Colour:** neutrals stay warm (paper, ink) so the Z mark belongs to them. Surfaces are white on a warm canvas. The sidebar is board ink. Coral is for the mark, the selected state's marker, the data line of a chart and a call to action on dark; it is never the colour of body text or large areas. Good and Bad get clearer, more saturated values than today's wine and green, always with a word and an arrow beside them.
- **Type:** one grotesque family for text and figures, with tabular figures on everywhere numbers line up, and a monospaced face only for code and identifiers. Today's General Sans and Geist Mono are kept unless the comparison in ticket 1 finds a face that suits Boardroom better; a face is only chosen if its licence allows self-hosted web use and embedding in Ziffr, and Ziffr ships the files itself (spec 0030's rule that a Theme can never load anything from anywhere stays).
- **Shape and depth:** 12px radius on cards, 8px on controls, a hairline plus a soft two-layer shadow on cards, no textures, no cast shadows.
- **Density:** figures larger than today (a tile's value is the first thing read), table rows tall enough to read, no box inside a box.
- **Dark:** a designed dark Appearance from the same semantic names, not a colour inversion; the dark sidebar remains the anchor in both.
- **A wordmark** beside the Z, drawn once as a vector (`ziffr-wordmark.svg`) with light and dark versions and a clear-space rule; the icon generator `scripts/app-icons.mjs` produces every PNG from it as it does for the mark.

### Rolling out

- **The app** takes the tokens in one pull request for the shell (sidebar, header, cards, chips, tables, buttons, forms) and one for each area that needs more (charts and tiles, decks and slides, sign-in). Each pull request updates the user guide screens it changes (`docs/user-guide`, checked in CI).
- **No change to data, permissions or Themes of a Workspace.** An existing Workspace's Themes, logo and Appearance setting are untouched; only Ziffr's own chrome and the two Standard Themes change. A Standard Theme already added to a Workspace never changes (GLOSSARY: Standard Theme).
- **The marketing website is not in this repository** (owner decision, 2026-11-22). It lives in a repository of its own, because its content (copy, pricing, case studies, posts) changes on its own rhythm, is not open source, sells the hosted ziffr.net rather than the self-hosted app, and should not be inherited by a fork. It takes the generated `tokens.css`, the type scale and the brand files from the published `@ziffr/design-tokens` package, pinned to a version, so it can only drift when someone bumps it. Until the package exists (ticket 2) the site keeps a copy of the Boardroom values in one file, marked as temporary, and replaces it by the package. The docs site (`apps/docs`) stays here: it documents the product and has to version with it.

## Testing Decisions

- The token package's checks above run in CI as unit tests; they are the contract.
- The Standard Theme files are generated, and the existing Theme tests (format, contrast, red-blindness) run on them unchanged.
- The app shell is tried in the running app in light and dark and at phone width before each pull request, and the screens in the user guide are regenerated.
- The email layout keeps its tests (`branded-email.test.ts`) and gains one that its colours equal the package's email values.

## Out of Scope

- Changing what a Workspace's own Themes look like, or the Theme format (`ziffr.theme/1`).
- Redesigning pages, navigation or flows (spec 0036 covers the layout); this spec changes how the existing ones look.
- Building the marketing website: it has its own repository; this spec only provides what it consumes.
- Illustration, photography and motion beyond the existing durations and easings.

## Tickets

1. **Wordmark, type and final token values:** the wordmark as a vector, the type decision, and the full light and dark token set in the brand guide draft. Done when the owner has approved them on real screens.
2. **`packages/design-tokens`:** the JSON, the generator for CSS, email values and Theme files, and the tests above. Blocked by 1.
3. **The app shell on the tokens:** sidebar, header, cards, chips, tables, buttons, forms; textures and cast shadows removed; user guide screens updated. Blocked by 2.
4. **Tiles, charts and decks on the tokens.** Blocked by 3.
5. **Ziffr Light and Ziffr Dark and the email layout** read from the package. Blocked by 2.
6. **Brand guide** on the docs site (`docs/brand` grows into it). Blocked by 1; fills in as 3 to 5 land.
7. **Publish `@ziffr/design-tokens`** to npm with the brand files and the trademark note; the website repository then replaces its temporary copy of the values by the package. Blocked by 2. (The website itself is built in its own repository and is not a ticket here.)

## Open Questions

- **The wordmark:** lowercase or capitalised, a custom drawn Z or the typeface's own. Decided in ticket 1 by looking at options on real screens.
- **Fonts:** keep General Sans, or move to a face that suits Boardroom better; the licence is checked either way.
