# @ziffr/pack

Write and check a [Ziffr](https://github.com/ziffr/ziffr) Pack: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes, as one file with no code. MIT licensed, Node 20 or later. Ziffr runs exactly these checks on every Pack it is given, so a Pack this kit accepts is one Ziffr accepts.

## Check a Pack

```sh skip="installs a package and needs a Pack file of your own"
npx @ziffr/pack check saas.pack.json
```

```text
saas.pack.json: SaaS metrics 1.2.0 is a valid Pack, 9 items. It holds Themes: an Owner installs it.
```

A file with problems names each one with its line, and the command ends with 1:

```text
saas.pack.json:10: license must be one of “CC-BY-4.0”, “MIT”, “Ziffr-Pack-1.0”.
saas.pack.json:64: contents.dashboards[0].template.slots[1].suggests names “customers”, which is not a Metric Catalog entry of this Pack.
```

- `--ziffr 0.12.0` also checks that the Pack can be installed on that Ziffr (its `ziffr` field).
- A Pack's `logo` (one PNG, JPEG or plain SVG, at most 128,000 bytes and 512 pixels a side) is checked with the same code Ziffr uses for a Theme's logo, and a problem names the line of `logo`. An SVG is parsed strictly, held to lists of elements and attributes, and written out again; that written-out form is the only one Ziffr stores or serves. `logoOk`, `logoProblem`, `cleanLogo` and `svgClean` are exported for programs.
- A Pack may say whom it is for in `audience` (industries, segments, Business Functions, employee bands, revenue bands, countries, each from a fixed list that `@ziffr/pack` exports: `INDUSTRIES`, `SEGMENTS`, `BUSINESS_FUNCTIONS`, `EMPLOYEE_BANDS`, `REVENUE_BANDS`, `COUNTRIES`). Unknown keys, repeats, empty parts and an audience without a `ziffr` minimum are refused, and a problem names the part.
- A Pack in the format `ziffr.pack/2` may name **Positions** and **Repeats** (who does what when it is set up), add a Repeat up in a **Total**, credit other Packs in `basedOn`, say where each number **comes from** (`comesFrom`; `packOverview` and `includedAndNeeded` work out what a page shows) and carry a **Pack Guide**: plain headings, paragraphs and lists with bold words, which `guideRuns` splits for drawing. `/1` files are read as ever, and a `/2` Workflow Template belongs in a `/2` Pack.
- Texts that read like instructions to an AI assistant are listed, without failing the check: Ziffr shows them to whoever installs the Pack.

## In a program

```js skip="a fragment: text is the Pack's file"
import { checkPack } from "@ziffr/pack";

const res = checkPack(text);
if (!res.ok) for (const p of res.problems) console.log(p.line, p.path, p.message);
```

Each format has its own check and JSON Schema as well: `checkMetricFile`, `checkDashboardTemplateFile`, `checkDeckTemplateFile`, `checkWorkflowTemplateFile`, `checkThemeFile`, `checkViewDesign`, `checkAnalysisRecipe`, and `PACK_SCHEMA`, `PACK_2_SCHEMA`, `METRIC_FILE_SCHEMA` and the others.

## Writing one

The format, its rules and the licenses a Pack may carry are in [Writing a Pack](https://github.com/ziffr/ziffr/blob/main/docs/guides/packs.md). The quickest start is **Export as Pack** in Ziffr: pick things of your Workspace and get a Pack of them, with none of your values.
