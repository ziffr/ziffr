# Writing a Pack

A **Pack** is one file of things to add to a Workspace: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes. It holds no code. Each thing in it is a document in a format Ziffr already checks, and Ziffr checks it exactly as it would on its own. The Pack only wraps them, with a manifest that names the Pack, its version, its author and its license.

For the logo, sizes and the checks in one place, see [For Pack creators](pack-creators.md). The quickest start is **Export as Pack** in Ziffr (below). Check a Pack on your own computer with the same checks Ziffr runs, from [`@ziffr/pack`](../../packages/pack/README.md) (MIT):

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
| The Pack and its manifest | `ziffr.pack/1` or `ziffr.pack/2` | [`pack.schema.json`](../reference/pack.schema.json) and [`pack-2.schema.json`](../reference/pack-2.schema.json), see [Who does what](#who-does-what-ziffrpack2) |
| A Metric Catalog entry | `ziffr.metric/1` | [`metric.schema.json`](../reference/metric.schema.json) |
| A Dashboard Template | `ziffr.dashboard-template/1` | [`dashboard-template.schema.json`](../reference/dashboard-template.schema.json) |
| A Deck Template | `ziffr.deck-template/1` or `ziffr.deck-template/2` | [`deck-template.schema.json`](../reference/deck-template.schema.json) and [`deck-template-2.schema.json`](../reference/deck-template-2.schema.json), see [Slides that look designed](#slides-that-look-designed) |
| A Workflow Template | `ziffr.workflow-template/1` or `ziffr.workflow-template/2` | [`workflow-template.schema.json`](../reference/workflow-template.schema.json) and [`workflow-template-2.schema.json`](../reference/workflow-template-2.schema.json), see [Who does what](#who-does-what-ziffrpack2) |
| A View Design | `ziffr.view/1` | [`view-design.schema.json`](../reference/view-design.schema.json), see [Writing a View Design](view-designs.md) |
| An Analysis Recipe | `ziffr.analysis/1` or `ziffr.analysis/2` | [`analysis-recipe.schema.json`](../reference/analysis-recipe.schema.json) and [`analysis-recipe-2.schema.json`](../reference/analysis-recipe-2.schema.json), see [Analysis Recipes](analysis-recipes.md) |
| A Theme | `ziffr.theme/1` or `ziffr.theme/2` | [`theme.schema.json`](../reference/theme.schema.json) and [`theme-2.schema.json`](../reference/theme-2.schema.json) |

## The file

Ziffr's own starting Packs, in [`packs/`](../../packs/README.md), are complete examples of every kind of item.


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
- a Derived Metric's formula names the Pack's other entries in braces: `"{mrr} / {customers}"`, and may read another entry's target with `"target({mrr}) - {mrr}"` ([what it gives](../user-guide/10-metrics.md#reading-a-target); a Pack carries no Target Series, so whoever sets it up gives that Metric its target). An older Ziffr refuses a Pack with `target()` naming the character it cannot read. Its inputs follow the same rules as in a Workspace: no Derived Metric among them, all of the Derived Metric's own period, none set to Aggregation none.

## Slides that look designed

A Deck Template in the format `ziffr.deck-template/2` may put **Slide Elements** on its slides: parts that draw themselves in the deck's Theme and fill their words from the data each time they are shown. A shape of the kind `element` names where it stands, the Slots it reads, in order, and what it draws:

```json skip="two shapes of a slide, not a whole file"
[
  { "shape": "element", "x": 64, "y": 85, "w": 980, "h": 40, "slots": [7],
    "element": { "kind": "words", "text": ["The commit covers {latest} of quota with {weeks left} left"], "font": "heading", "size": 33 } },
  { "shape": "element", "x": 356, "y": 147, "w": 276, "h": 112, "slots": [1, 0],
    "element": { "kind": "figure", "note": "{gap 2 1}", "signal": true } }
]
```

| `kind` | Slots | What it draws |
| --- | --- | --- |
| `words` | any | Paragraphs in a Theme colour (`tone`) and font (`heading` or `body`), with size, weight, spacing, capitals, alignment and an optional `lead`. `foot` makes it the slide's footer line; `empty` stands instead of the words while a Placeholder has no value. |
| `box` | none | A rectangle with a `fill` and an `edge` colour. |
| `figure` | the value first | A label, the first Metric's latest value and a `note`; `signal` colours the note by good or bad, `strong` draws it on the cover colour. |
| `columns` | the columns, then the filled part (`part`), then the line (`reference`) | Columns by period: the weeks of the quarter so far, or the last `periods`. |
| `gap-table` | the Metric, then what it is compared with | Their latest Breakdowns row by row with the difference, with an optional `headline` above and a closing line (`lead`, `note`) under it that move with the table. |
| `metric-table` | 1 to 12 | A row per Metric with the change, a trend of `periods` and whether it is on target. |
| `list` | none | A `title` and up to 8 numbered `items`. |
| `logo` | none | The Theme's logo, or a dashed box with `text`. |
| `art` | none | A fixed ornament (`rings-trend`). |

Colours are always roles of the Theme (`ink`, `muted`, `rule`, `surface`, `canvas`, `band`, `accent`, `soft`, `cover`, `cover-text`, `cover-accent`, `good`, `bad`, `data`), never values. Words hold plain text and these Placeholders: `{metric}`, `{latest}`, `{period}`, `{target}`, `{change yoy}`, `{change}`, `{difference 1 2}`, `{left 1 2}`, `{gap 1 2}`, `{quarter}`, `{quarter week}`, `{quarter weeks}`, `{weeks left}`, `{scale}` and `{slide}`; a number names the element's Slot, counted from 1. A slide may say `"cover": true`: no logo, footer or number of the Theme, and not counted in page numbers. The [user guide](../user-guide/14-decks-and-themes.md#slide-elements) says what each element shows.

A file without elements and covers stays `ziffr.deck-template/1`. An older Ziffr refuses a `/2` file naming the formats it reads, so give a Pack that uses it a `ziffr` minimum that has it.

## Filling the Metrics from other systems

A Pack may say which of Ziffr's ready n8n templates ([Automation Templates for Feeds](../automations/README.md)) fill which of its Metric Catalog entries, so that the person who sets the Pack up can fill them without anyone retyping the numbers:

```json
"feeds": [{ "template": "google-sheets", "fills": ["headcount", "attrition"] }]
```

- `template` is the id of a template Ziffr ships (today `google-sheets`, `excel`, `stripe`, `hubspot`, `bigquery` and `snowflake`; the ids are in `docs/automations/feed-templates.json`). Nothing else is accepted: a Pack names a template, it never carries or links to a flow of its own.
- `fills` are keys of the Pack's own Metric Catalog entries that take values. A Derived Metric cannot be filled, and an entry or a template is named once.
- Installing makes nothing of it. After **Set up from this Pack**, the page offers **Fill from n8n** for the Metrics made from those entries, with the template already chosen.
- A Pack that uses `feeds` should say so in its `ziffr` minimum version: an older Ziffr refuses a field it does not know. `npx @ziffr/pack check` checks it with the same code as the server.

## Whom it is for

A Pack may say whom it is for with an optional `audience`, beside `ziffr` and `logo`. Ziffr uses it to suggest the Packs that fit a Workspace first, in the Setup Guide; it never hides a Pack from anyone, and a Pack without one is simply not suggested for a reason. Every part is optional and lists distinct keys from Ziffr's fixed lists, which `@ziffr/pack` exports so your tools check against the same ones:

```json skip="a fragment of a Pack's manifest"
"audience": {
  "industries": ["saas"],
  "segments": ["b2b"],
  "functions": ["management", "finance"],
  "employeeBands": ["11-50", "51-200"],
  "revenueBands": ["1m-10m"],
  "countries": ["DE", "AT", "CH"]
}
```

| Part | Keys | At most |
| --- | --- | --- |
| `industries` | `saas`, `ecommerce`, `retail`, `wholesale`, `manufacturing`, `construction`, `real_estate`, `professional_services`, `agency`, `financial_services`, `healthcare`, `education`, `hospitality`, `logistics`, `energy`, `media`, `agriculture`, `other` | 18 |
| `segments` | `b2b`, `b2c`, `b2b2c`, `public_sector`, `non_profit` | 5 |
| `functions` | the Business Functions: `sales`, `marketing`, `finance`, `operations`, `customer_support`, `people`, `product_engineering`, `management`, `other` | 9 |
| `employeeBands` | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1000+` | 6 |
| `revenueBands` | `<1m`, `1m-10m`, `10m-50m`, `50m-250m`, `250m-1b`, `1b+` | 6 |
| `countries` | ISO 3166-1 alpha-2 codes such as `DE` | 50 |

A key that is not on its list, a key listed twice, an empty part, an empty `audience` and a part Ziffr does not know are refused with the part named. An older Ziffr refuses the whole field as unknown, so a Pack that uses it states a `ziffr` minimum (Ziffr 0.16 or later), and the check refuses an `audience` without one. Be sparing: name the industries and functions the Pack is really made for, and leave a part out when the Pack suits everyone. The more a Pack names, the more often it is suggested where it does not fit.

How a Workspace's answers rank the Packs: an industry that matches adds 4 points, a function 3, a segment 2, and an employee band, a revenue band or a country 1 each. A part you did not list, or that the Workspace did not answer, adds nothing, and a Pack is never ranked lower for being specific. The order is the same every time for the same answers.

## Who does what (`ziffr.pack/2`)

A Pack in the format `ziffr.pack/2` may also say who does what, as **Positions** such as "Sales lead" that people fill when it is set up, which parts are made once for each salesperson, site or company, its **Repeats**, which Metrics add those up, its [Totals](#totals), and [where each number comes from](#where-each-number-comes-from). It names no person. It may credit the Packs it builds on and carry a [Pack Guide](#the-pack-guide).

Ziffr checks all of it and installs such a Pack today, unless it holds a Total. The Packs page shows its Positions, Repeats and proposed Shares before and after installing. **Set up from this Pack** asks who fills each Position, shows who will then see what and which messages go out, and writes the people into the ordinary places; a proposed Share is made only when ticked, and one that would show someone more starts unticked. **It does not list the lines of a Repeat yet**, so what is made once per line cannot be set up. A Workflow Template stored by the Workspace holds neither Positions nor Tell steps: Set up reads them from the install. **A Pack with a Total cannot be installed yet:** Ziffr says so and adds nothing of it. The rest follows in later versions.

Keep a file in `ziffr.pack/1` unless it uses something below: an older Ziffr refuses a `/2` file, saying which formats it reads. A whole example:

```json
{
  "format": "ziffr.pack/2",
  "id": "ziffr/site-safety",
  "name": "Site safety",
  "version": "1.0.0",
  "summary": "Incidents per site, reported every week.",
  "author": { "name": "Ziffr" },
  "license": "CC-BY-4.0",
  "positions": [
    { "key": "area-lead", "name": "Area lead", "people": "one" },
    { "key": "site-manager", "name": "Site manager", "people": "one", "per": "site" }
  ],
  "repeats": [{ "key": "site", "name": "Site", "max": 30 }],
  "guide": {
    "whatItsFor": [{ "type": "text", "text": "Each site reports its **incidents** every week." }],
    "firstSteps": [{ "type": "list", "numbered": true, "items": ["Open Packs.", "Choose **Set up from this Pack**."] }]
  },
  "contents": {
    "metrics": [
      { "key": "incidents", "per": "site", "submitters": ["site-manager"], "standIn": "area-lead", "viewers": ["area-lead"], "metric": { "format": "ziffr.metric/1", "name": "Incidents", "period": "week", "aggregation": "sum", "polarity": "lower" } }
    ],
    "workflows": [
      { "key": "weekly", "per": "site", "template": { "format": "ziffr.workflow-template/2", "name": "Weekly site report", "dueWorkingDays": 2, "steps": [{ "type": "approve", "approvers": 1, "by": ["area-lead"] }, { "type": "publish", "lock": false }] } }
    ]
  }
}
```

### Positions and Repeats

`positions` (at most 20) each have a `key`, a `name` of at most 60 characters, and `people`: `"one"` or `"several"` (at most 20). `repeats` (at most 5) each have a `key`, a `name` and, if you like, `max`, the most lines it takes (at most 50). Keep every key across versions. `"per": "site"` on a Position gives each line its own holder; on a Metric Catalog entry, a dashboard or a Workflow it makes that item once per line.

| Where | Field | Takes |
| --- | --- | --- |
| A Metric Catalog entry's wrapper | `submitters` | Positions for one or several |
| | `standIn` | one Position for one person, not among the `submitters`, which it needs |
| | `viewers`, `editors` | Positions for one or several, proposed as Shares |
| A dashboard's wrapper | `viewers`, `editors` | the same |
| An Approve step | `by` | one Position for one person per Approver, in order: as many as `approvers` |
| A Checklist Item for information | `to` | Positions for one or several |
| A Checklist Item to tick off | `assignee`, `standIn` | one Position for one person each; a `standIn` needs an `assignee` and is another one |
| A Tell step | `to` | Positions for one or several |
| A Send Snapshot step | `to`, `dashboard` | Positions, and the key of a Dashboard Template of the Pack |

- A **Tell step** can only travel in `ziffr.workflow-template/2`, and only one that waits for a share: `"condition": { "kind": "share_of_target", "share": "90" }` or `changed_more`, a share from 1 to 1000. A level is a number of your business and a Webhook is yours: neither has a field. At most 3 Tell steps.
- A Workflow Template that names Positions belongs in a Pack: on its own there is nothing the keys could mean.
- **Outside its Repeat,** a Position of a Repeat means everyone in all its lines. That is fine where several people fit, and refused where one is needed.
- A formula may use entries of its own Repeat and entries outside every Repeat; nothing else may reach into a Repeat. A dashboard outside a Repeat takes a repeated entry only in a Slot with `"multiple": true`, and only a Workflow of the same Repeat can send a dashboard made once per line.
- A Derived Metric has no `submitters` or `standIn`: it takes no values.

### Totals

A Metric Catalog entry outside every Repeat may be a **Total**, which adds up the Metrics made from one entry of a Repeat, such as the commit of all salespeople. It says so in its wrapper, in place of a formula:

```json skip="two entries of a Pack, not a whole file"
{ "key": "commit", "per": "salesperson", "metric": { "format": "ziffr.metric/1", "name": "Commit", "period": "week", "aggregation": "last", "polarity": "higher" } },
{ "key": "team-commit", "total": { "of": "commit", "targets": "parts" }, "metric": { "format": "ziffr.metric/1", "name": "Team commit", "period": "week", "aggregation": "last", "polarity": "higher" } }
```

- `of` names an entry with `per` that takes values, whose Aggregation is not `none`. The Total has its period, unit, number format (`valueFormat`) and Aggregation.
- `targets` is `own`, for a target set on the Total, or `parts`, for the targets of its parts added up; with `parts` the entry has no `targetMin` or `targetMax`.
- A Total takes no values: no `per`, formula, `sources`, `submitters` or `standIn`, and no Feed fills it. A formula may read it, and `viewers` and `editors` may be proposed.
- **A Pack cannot open a Total.** Who sees a Total's numbers without seeing every part is its owner's decision in the app, and there is no field for it.
- A gap table of a Deck Template does not take a Total yet.

### Where each number comes from

Say for every number somebody or something has to send where it comes from, with `comesFrom` on the entry's wrapper:

```json skip="two entries of a Pack, not a whole file"
{ "key": "commit", "comesFrom": { "by": "person" }, "metric": { "format": "ziffr.metric/1", "name": "Commit", "period": "week", "aggregation": "last", "polarity": "higher" } },
{ "key": "closed", "comesFrom": { "by": "system", "system": "CRM", "note": "The deals won this quarter." }, "metric": { "format": "ziffr.metric/1", "name": "Closed", "period": "week", "aggregation": "last", "polarity": "higher" } }
```

| Field | Takes |
| --- | --- |
| `by` | `person`, someone types it; `system`, another system sends it; `target`, it is set once as a target |
| `system` | with `system` only, and needed then: the kind of system, such as “CRM”, at most 60 characters |
| `note` | optional, at most 300 characters |

Do not write it on a Derived Metric or a [Total](#totals): Ziffr calculates those and shows from which entries. Name the n8n templates that fill an entry in [`feeds`](#filling-the-metrics-from-other-systems); say only what they really do. Ziffr shows a table **Where the numbers come from** and what is **Included** and **still needed** before installing and in Help, and Set up asks nobody for a number another system sends unless the person chooses to. A number without `comesFrom` shows as **The Pack does not say**; the Marketplace lists a Pack only when every number that takes values has it.

### Credit

`basedOn` lists at most 10 Packs whose items yours carries, each with its `id`, `name`, `author` and `license` as that Pack wrote them, and an item's wrapper says which it is `from`: `"from": "someone/safety"`. It is shown as credit and proved by nothing.

### The Pack Guide

`guide` is where you explain your Pack, read before installing (in the preview) and afterwards in Help, with the installed Pack. It has five sections, each optional, in this order and under Ziffr's own titles: `whatItsFor` (What it's for), `beforeYouStart` (Before you start), `firstSteps` (First steps), `eachPart` (Each part) and `questions` (Questions).

A section is a list of blocks:

| Block | Shape |
| --- | --- |
| A heading | `{ "type": "heading", "text": "Incidents" }` |
| A paragraph | `{ "type": "text", "text": "Anything that hurt someone or nearly did." }` |
| A list | `{ "type": "list", "items": ["One.", "Two."], "numbered": true }` |

Put `**` before and after words to show them **bold**; there is no other formatting. A guide holds no link, web or email address, image, HTML or code: every text is plain, as any name in a Pack is, also as it reads without the bold marks. The whole guide is at most 32,768 bytes, with at most 60 blocks in a section, 20 entries in a list, 80 characters in a heading and 600 in a paragraph or entry. Words in it that read like instructions to an AI assistant are listed for whoever installs.

## The logo

A Pack may bring **one logo**, optionally, as a data address in the manifest's `logo` (beside `listing`, never in `contents`): `"logo": "data:image/png;base64,…"`. Its `author` is the publisher it is shown with. A Theme of the Pack may say `"slides": { "logo": "pack" }` to use it; that is the only value the field takes, a Theme file on its own may not say it, and neither may a Theme of a Pack without a logo. A Pack with a logo needs a Ziffr that knows the field, so set `ziffr` to the version that does. A Pack's licence covers its contents, not anyone's trademark: the logo stays the publisher's. Installing checks the logo again on the server and keeps only the form Ziffr wrote out itself (an SVG is serialized again from what was read); a Theme that says `"pack"` is installed with it, and installing never makes a Theme the team default.

## What is refused

Ziffr checks a Pack in full on its server before it shows or installs anything:

- a file over 1 MiB, more than 200 items, or more than 50 of one kind;
- an `audience` with a key outside Ziffr's lists, a key twice, an empty part, a part Ziffr does not know or no `ziffr` minimum beside it;
- a field Ziffr does not know, or one given twice. A field called `__proto__` is read as an unknown field, never as anything else;
- a web address, HTML, a script, a template in braces or a line break in any text of `contents`. Words of widgets may hold the Placeholders Ziffr knows, such as `{metric}` or `{change yoy}`. The text check reads Unicode the way a person does: an address with an accent mark, an invisible character or letters of another width in it is an address too, while ordinary accented words pass;
- images and fonts, except the Pack's one `logo`: a Theme uses only fonts Ziffr ships, and its background image is set in Ziffr after installing;
- a `logo` that is not a PNG, JPEG or plain SVG as a base64 data address, weighs over 128,000 bytes, measures over 512 pixels on a side, or whose bytes are not the type it says; an SVG with a script, a handler, foreign content, a link, a style, an entity or a `<!DOCTYPE>`. These are the checks a Theme's logo has, the very same code. `npx @ziffr/pack check` reports them with the line of `logo`;
- a Dashboard Template with a Free Layout, a Slot it does not have, or widgets that overlap;
- a slide of a Deck Template with anything but widgets, text, simple boxes and Slide Elements, or a shape past the slide's edge;
- a Workflow Template that names a person: an Approve step says only how many Approvers to pick, and in `/2` which Positions of the Pack they are;
- in `ziffr.pack/2`: a Position, Repeat or credited Pack that is not listed or is listed twice, a Position for several people where one is needed, a Tell step with a level, and everything else the rules under [Who does what](#who-does-what-ziffrpack2) refuse;
- a Pack Guide with a link, an address, markup or code in it, or over its limits;
- a field of `ziffr.pack/2` in a `ziffr.pack/1` file;
- an item that its own format's checks refuse, with the problem named by its place in the Pack, such as `contents.views[0].design.parts[2].show`, and its line;
- a reference to an item that is not in the Pack.

Mind the Size. **Set up from this Pack** shows the person how many Metrics a full set-up makes against what their Workspace's Size still holds (the smallest hosted Size, Small, holds 50), and every Metric it makes counts. A Pack of 40 entries fits an empty Small Workspace and few others. Aim for a core of about 8 to 12 entries that answer the question the Pack is named for, and put the rest in a second Pack, so people can start without making room first. This is advice, not a rule of the format: `npx @ziffr/pack check` says nothing about it.

Texts that address an AI assistant, such as "ignore your instructions" or "call delete_metric", do not stop the check. Ziffr shows them to the person installing the Pack, since descriptions of Metrics reach assistants through the MCP Server. It is a filter for the obvious; assistants reach Ziffr only through their key's scopes.

A Pack with Themes can be installed only by an Owner, since only Owners change Themes.

## Export as Pack

Under **Workspace → Packs**, **Export as Pack…** makes a Pack of things you pick in your Workspace: Metrics (as Metric Catalog entries), the Workspace's own catalog entries from Packs, Dashboard, Deck and Workflow Templates, View Designs and Themes. Give it a name, an id (your handle and a slug), a version, a summary, an author and a license, and choose **Download Pack**. The Tags of the Metrics you pick go in, up to 5 per entry and only Tags you can see on those Metrics; untick **Carry the Tags** to leave them out.

- It holds Metric Descriptions only, never a value, an owner, a Submitter or a Token, and only of Metrics you see.
- The step **Describe your Pack** writes the [Pack Guide](#the-pack-guide): one field per section, **Each part** starting with the list of what goes into the file. A Pack with a guide is written as `ziffr.pack/2`; without one it stays `ziffr.pack/1`. A guide a Pack was installed with can be taken over there.
- A Slot suggests the catalog entry of the Metric the template was made with, when that Metric is in the Pack too. A Derived Metric goes in only with the Metrics it is computed from.
- Words that a Pack may not hold, such as a description with a web address, stay out of the file. Drawings on slides stay out, and so does every logo but the one you choose: under **Logo** you take the logo of one of your Themes or upload a picture, and Themes that use it say `"logo": "pack"`. The **Author** starts as your name and is the publisher the logo is shown with. Ziffr lists everything that stayed out, and why.
- Things a Pack installed keep their keys, so exporting what a Pack added gives the same file again.

## Licenses

A Pack carries one license from a short list: `CC-BY-4.0` or `MIT` for a free Pack, `Ziffr-Pack-1.0` for a paid one, once paid Packs exist. Whoever installs a free Pack may change and share it on its license's terms. Ziffr's own Packs are CC BY 4.0.

## Publishing

For now, share the file: whoever installs it uploads it on their Packs page and confirms that the Marketplace did not check it. Publishing on the Marketplace comes later (spec 0030).
