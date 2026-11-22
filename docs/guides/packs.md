# Writing a Pack

A **Pack** is one file of things to add to a Workspace: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes. It holds no code. Each thing in it is a document in a format Ziffr already checks, and Ziffr checks it exactly as it would on its own. The Pack only wraps them, with a manifest that names the Pack, its version, its author and its license.

The quickest start is **Export as Pack** in Ziffr (below). Check a Pack on your own computer with the same checks Ziffr runs, from [`@ziffr/pack`](../../packages/pack/README.md) (MIT):

```sh skip="installs a package and needs a Pack file of your own"
npx @ziffr/pack check saas.pack.json
```

```text
saas.pack.json: SaaS metrics 1.2.0 is a valid Pack, 9 items. It holds Themes: an Owner installs it.
```

A file with problems names each with its line and ends with 1, so it fits a build step. `--ziffr 0.12.0` also checks that the Pack can be installed on that Ziffr. In a program, `import { checkPack } from "@ziffr/pack"` gives the same result as an object.

The exact formats are JSON Schemas in `docs/reference/`, generated from the definitions the checks run:

| What | Format | Schema |
| --- | --- | --- |
| The Pack and its manifest | `ziffr.pack/1` | [`pack.schema.json`](../reference/pack.schema.json) |
| A Metric Catalog entry | `ziffr.metric/1` | [`metric.schema.json`](../reference/metric.schema.json) |
| A Dashboard Template | `ziffr.dashboard-template/1` | [`dashboard-template.schema.json`](../reference/dashboard-template.schema.json) |
| A Deck Template | `ziffr.deck-template/1` | [`deck-template.schema.json`](../reference/deck-template.schema.json) |
| A Workflow Template | `ziffr.workflow-template/1` | [`workflow-template.schema.json`](../reference/workflow-template.schema.json) |
| A View Design | `ziffr.view/1` | [`view-design.schema.json`](../reference/view-design.schema.json), see [Writing a View Design](view-designs.md) |
| An Analysis Recipe | `ziffr.analysis/1` | [`analysis-recipe.schema.json`](../reference/analysis-recipe.schema.json), see [Analysis Recipes](analysis-recipes.md) |
| A Theme | `ziffr.theme/1` | [`theme.schema.json`](../reference/theme.schema.json) |

## The file

Ziffr's own five starting Packs, in [`packs/`](../../packs/README.md), are complete examples of every kind of item.


```json
{
  "format": "ziffr.pack/1",
  "id": "ziffr/saas-metrics",
  "name": "SaaS metrics",
  "version": "1.2.0",
  "summary": "MRR, customers and revenue per account, with a monthly dashboard.",
  "author": { "name": "Ziffr" },
  "license": "CC-BY-4.0",
  "ziffr": ">=0.12",
  "listing": { "homepage": "https://example.com/saas-pack" },
  "contents": {
    "metrics": [
      { "key": "mrr", "metric": { "format": "ziffr.metric/1", "name": "MRR", "period": "month", "aggregation": "last", "polarity": "higher", "unit": "€", "valueFormat": "currency" } },
      { "key": "customers", "metric": { "format": "ziffr.metric/1", "name": "Customers", "period": "month", "aggregation": "last", "polarity": "higher" } },
      { "key": "arpa", "metric": { "format": "ziffr.metric/1", "name": "Revenue per account", "period": "month", "aggregation": "last", "polarity": "higher", "formula": "{mrr} / {customers}" } }
    ],
    "dashboards": [
      {
        "key": "saas-overview",
        "template": {
          "format": "ziffr.dashboard-template/1",
          "name": "Monthly overview",
          "slots": [{ "label": "MRR", "suggests": "mrr" }, { "label": "Customers", "suggests": "customers" }],
          "widgets": [
            { "view": "number", "slots": [0], "x": 0, "y": 0, "w": 6, "h": 4, "title": "{metric} this month" },
            { "view": "line", "slots": [1], "x": 6, "y": 0, "w": 6, "h": 6, "settings": { "window": 12, "showTarget": true } }
          ]
        }
      }
    ]
  }
}
```

- **`id`** is your Marketplace handle and a slug. It stays the same for every version.
- **`version`** is three numbers: major, minor and patch. Each new version is higher than the last.
- **`license`** is `CC-BY-4.0` or `MIT` for a free Pack, `Ziffr-Pack-1.0` for a paid one. Nothing else is accepted.
- **`ziffr`** is the oldest Ziffr that can install the Pack. An older Ziffr says "needs Ziffr 0.12 or later" and installs nothing.
- **`listing`** holds the only web addresses a Pack may have, `https` only: a homepage and a support page.
- **Every item** has a `key`, unique in the Pack and kept across versions. Updating and uninstalling match items by it.

## Items name each other by key

An item may name another item of the same Pack, and nothing outside it:

- a Metric Catalog entry may carry up to 5 `tags`: free words a Metric made from the entry gets (`"tags": ["finance", "monthly review"]`). A Tag is 1 to 32 characters of plain text (no comma, markup, web address or control character), a word is one Tag whatever its capitals (`Finance` and `finance` twice is an error), and a leading `#` and extra spaces are dropped. They are the same rules as a Tag typed in Ziffr, checked by `npx @ziffr/pack check` with the same code, and a Tag that reads as an order to an assistant is listed for the person installing to read, like any text of a Pack. Tags are not the `industries` and `segments` keys, which only suggest the entry to Workspaces of a kind. A Pack that uses `tags` should say so in its `ziffr` minimum version: an older Ziffr refuses a field it does not know. Installing a Pack still makes no Tag; **Set up from this Pack** or the Metric Catalog makes the Metric, matching the Workspace's Tags by name and making the others, within the Tag limits;
- a Dashboard Template's Slot may suggest one of the Pack's Metric Catalog entries: `"suggests": "mrr"`;
- a widget drawn by a View Design names one of the Pack's View Designs: `"view": "design"`, `"settings": { "design": "trend" }`. Outside a Pack, the design is written out in full instead;
- a Deck Template names one of the Pack's Themes, which a deck made from it starts with: `"theme": "board"`. Its Slots and widgets name entries and designs as a Dashboard Template's do;
- a Derived Metric's formula names the Pack's other entries in braces: `"{mrr} / {customers}"`. Its inputs follow the same rules as in a Workspace: no Derived Metric among them, all of the Derived Metric's own period, none set to Aggregation none.

## The logo

A Pack may bring **one logo**, optionally, as a data address in the manifest's `logo` (beside `listing`, never in `contents`): `"logo": "data:image/png;base64,…"`. Its `author` is the publisher it is shown with. A Theme of the Pack may say `"slides": { "logo": "pack" }` to use it; that is the only value the field takes, a Theme file on its own may not say it, and neither may a Theme of a Pack without a logo. A Pack with a logo needs a Ziffr that knows the field, so set `ziffr` to the version that does. A Pack's licence covers its contents, not anyone's trademark: the logo stays the publisher's.

## What is refused

Ziffr checks a Pack in full on its server before it shows or installs anything:

- a file over 1 MiB, more than 200 items, or more than 50 of one kind;
- a field Ziffr does not know, or one given twice. A field called `__proto__` is read as an unknown field, never as anything else;
- a web address, HTML, a script, a template in braces or a line break in any text of `contents`. Words of widgets may hold the Placeholders Ziffr knows, such as `{metric}` or `{change yoy}`;
- images and fonts, except the Pack's one `logo`: a Theme uses only fonts Ziffr ships, and its background image is set in Ziffr after installing;
- a `logo` that is not a PNG, JPEG or plain SVG as a base64 data address, weighs over 128,000 bytes, measures over 512 pixels on a side, or whose bytes are not the type it says; an SVG with a script, a handler, foreign content, a link, a style, an entity or a `<!DOCTYPE>`. These are the checks a Theme's logo has, the very same code. `npx @ziffr/pack check` reports them with the line of `logo`;
- a Dashboard Template with a Free Layout, a Slot it does not have, or widgets that overlap;
- a slide of a Deck Template with anything but widgets, text and simple boxes, or a shape past the slide's edge;
- a Workflow Template that names a person: an Approve step says only how many Approvers to pick;
- an item that its own format's checks refuse, with the problem named by its place in the Pack, such as `contents.views[0].design.parts[2].show`, and its line;
- a reference to an item that is not in the Pack.

Texts that address an AI assistant, such as "ignore your instructions" or "call delete_metric", do not stop the check. Ziffr shows them to the person installing the Pack, since descriptions of Metrics reach assistants through the MCP Server. It is a filter for the obvious; assistants reach Ziffr only through their key's scopes.

A Pack with Themes can be installed only by an Owner, since only Owners change Themes.

## Export as Pack

Under **Workspace → Packs**, **Export as Pack…** makes a Pack of things you pick in your Workspace: Metrics (as Metric Catalog entries), the Workspace's own catalog entries from Packs, Dashboard, Deck and Workflow Templates, View Designs and Themes. Give it a name, an id (your handle and a slug), a version, a summary, an author and a license, and choose **Download Pack**. The Tags of the Metrics you pick go in, up to 5 per entry and only Tags you can see on those Metrics; untick **Carry the Tags** to leave them out.

- It holds Metric Descriptions only, never a value, an owner, a Submitter or a Token, and only of Metrics you see.
- A Slot suggests the catalog entry of the Metric the template was made with, when that Metric is in the Pack too. A Derived Metric goes in only with the Metrics it is computed from.
- Words that a Pack may not hold, such as a description with a web address, stay out of the file. Images, logos and drawings on slides stay out as well. Ziffr lists everything that stayed out, and why.
- Things a Pack installed keep their keys, so exporting what a Pack added gives the same file again.

## Licenses

A Pack carries one license from a short list: `CC-BY-4.0` or `MIT` for a free Pack, `Ziffr-Pack-1.0` for a paid one, once paid Packs exist. Whoever installs a free Pack may change and share it on its license's terms. Ziffr's own Packs are CC BY 4.0.

## Publishing

For now, share the file: whoever installs it uploads it on their Packs page and confirms that the Marketplace did not check it. Publishing on the Marketplace comes later (spec 0030).
