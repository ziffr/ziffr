# Making your own Theme

A **Theme** is the look of everything that shows numbers: colours for text, surfaces, data, good, bad and the target band, three fonts, how cards are drawn, and what every slide shows. This guide is for people who make a Theme for their team, their company or others, and for those who share it.

## Start from something that works

- **A standard Theme.** On **Themes**, the list under **Standard Themes** holds the six Ziffr delivers: Ziffr Light, Ziffr Dark, Tokyo, Paris, Oslo and Print. Look at one on real Widgets, add it to the Workspace, and change it.
- **Duplicate** one of your Themes and change the copy.
- **Export as file** on any Theme, standard ones too, gives you a file to edit by hand.

Change colours in the editor and watch the preview. Then **Export as file** to keep or share the result.

## Colours that work

Whatever look you choose, check three things before you share a Theme:

- **Text on cards.** `ink`, `muted`, `accent`, `good` and `bad` on `surface` should have a contrast ratio of at least 4.5 to 1 (WCAG AA). The standard Themes all do; Print reaches 21 to 1.
- **Data colours.** Each colour in `data` should reach 3 to 1 on `surface`, or a line or bar disappears.
- **Good and Bad.** About one man in twelve cannot tell red from green. Give Good and Bad different lightness as well as different hue, so they stay apart. The standard Themes are tested with a simulation of red-blindness and green-blindness.

## The file

A Theme file is JSON, at most 8 KiB, in the format `ziffr.theme/1`. The exact format is the JSON Schema in [`docs/reference/theme.schema.json`](../reference/theme.schema.json), generated from the definition the checks run.

```json
{
  "format": "ziffr.theme/1",
  "name": "Harbour",
  "colors": {
    "canvas": "#E6EEF2",
    "surface": "#FFFFFF",
    "ink": "#102027",
    "muted": "#4A5F69",
    "rule": "#C9D6DC",
    "accent": "#0B6E99",
    "good": "#1B7F5C",
    "bad": "#B8401F",
    "band": "#D5E3EA",
    "data": ["#0B6E99", "#5E8CA3", "#7A8F99", "#B06A12"]
  },
  "fonts": { "heading": "ibm-plex-sans", "body": "ibm-plex-sans", "figures": "ibm-plex-sans" },
  "radius": 6,
  "cards": "flat",
  "slides": { "logoPosition": "top-right", "logoWidth": 140, "footer": "Board meeting", "showSlideNumber": true, "titleSize": 56, "bodySize": 24 }
}
```

| Part | What it is |
|---|---|
| `name` | At most 60 characters of plain text. |
| `colors` | Nine colours as `#` and six hex digits: `canvas` (behind the cards), `surface` (cards and slides), `ink` (text and values), `muted` (labels and axes), `rule` (lines and grid), `accent`, `good`, `bad` and `band` (the target band). `data` holds one to six data colours; the first is used for a single series. |
| `fonts` | `heading`, `body` and `figures`, each one of `general-sans`, `inter`, `ibm-plex-sans`, `libre-franklin`, `source-serif`, `playfair`, `georgia`, `arial`, `geist-mono`, `ibm-plex-mono`. |
| `radius` | How round cards are, 0 to 24 pixels. |
| `cards` | `paper` (textured, soft shadow), `flat` (a hairline edge) or `plain` (no edge). |
| `slides` | Optional. Logo position and width, a footer of at most 120 characters, whether slides show their number, and the sizes of titles and text. |

A Theme file holds **no image of its own, no font file and no web address**; the one thing it may say about its logo is `"logo": "pack"` inside a Pack that has a logo, to use the Pack's. Fonts are the ones Ziffr ships, so a file can never load anything from anywhere. Set the logo and background image in Ziffr after importing a file on its own. A name or footer with a web address or markup is refused.

## Import and export

- **Export as file** (Themes page, any Theme) downloads the file in your browser.
- **Import a Theme file** (Owners and Admins) takes pasted text or an uploaded file. Problems are shown with their line, and Ziffr checks the file again on its side before anything is stored. The imported Theme is a new Theme of the Workspace, and the import is written in the Audit Log. A Workspace keeps at most 50 Themes.

## Sharing Themes

- **One file.** Send the exported file. Whoever gets it imports it.
- **As a Pack.** A Pack carries Themes next to Metrics, templates and View Designs. In **Workspace → Packs**, **Export as Pack…** lets you pick Themes of your Workspace, and the logo of one of them as the Pack's logo; Themes that use it carry `"logo": "pack"`, any other logo stays out. A Deck Template in the Pack can name one of its Themes, which decks made from it start with. A Pack with Themes is installed by an Owner. See the [Packs guide](packs.md).
- **On the Marketplace.** Publishing Packs on the Marketplace comes later (spec 0030); a Pack that holds Themes will be published like any other. Until then, share the Pack file.

Check a Pack that holds your Theme before you share it with `npx @ziffr/pack check my.pack.json`; it runs the checks Ziffr runs, Theme files included. A single Theme file is checked when you import it.
