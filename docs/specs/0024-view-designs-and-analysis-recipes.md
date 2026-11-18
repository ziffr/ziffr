# 0024 View Designs and Analysis Recipes: new ways to draw and analyse, without running anyone's code

**Status:** in progress. **Tracking issue:** #145 (label `tracking`); tickets #146 to #152 carry `spec:0024`. Starts after spec 0023.

## Problem Statement

Ziffr draws Metrics with 15 built-in Views and analyses them with two built-in Analyses, forecast and correlation. All of them are code in the app: `apps/web/src/views/widget-body.tsx` draws each View by its id, and `apps/web/src/analyses/index.ts` lists the Analyses by hand. Both files say this is where a plugin seam belongs. Today a designer who wants a different chart, or an analyst who wants a moving average or a seasonality check, has to change Ziffr itself.

Letting people import their own code would be the obvious seam, and the wrong one. Code imported into the app runs with the rights of whoever looks at it: it could read every number on the page and send it anywhere. Checking such code for malice cannot be made reliable. And a number an imported calculation produces has not been verified the way spec 0022 requires for every number Ziffr shows.

## Solution

Two kinds of addition, both plain data, so nothing imported is ever run:

- **A View Design** is a View written as a file: which Metrics it takes (its Slots), what it draws (marks such as lines, bars, areas, points, text and a gauge), which value each mark shows, and its colours from the Theme. Ziffr checks the file and draws it with one renderer of its own. Every built-in View becomes a View Design drawn by that renderer, so any View can be exported as a starting point, changed by a designer in a playground, and brought back in.
- **An Analysis Recipe** is an Analysis written as a file: steps built only from functions Ziffr provides and verifies (spec 0022), such as a moving average, growth, a linear trend, seasonality or a standard deviation, over the Metrics in its Slots. Every number it produces is computed by verified functions, so it is as trustworthy as any other number in Ziffr. Forecast and correlation become recipes too, where their methods can be written that way.

Code plugins, for Views or Analyses no file can describe, are a later step with a sandbox of their own (see Further Notes), not part of this spec.

## User Stories

1. As a designer, I want to export any View, built in or a team's, as a file with Sample Data, so that I start from something that works instead of from nothing.
2. As them, I want a playground in Ziffr where I paste or upload a View Design and see it drawn at once, with Sample Data or with my own Metrics, and where every mistake in the file is named with its line, so that I can work on it quickly.
3. As them, I want to start from a widget on a dashboard (**Duplicate as View Design**), so that its settings come along.
4. As an Owner or Admin, I want to add a View Design to the Workspace, so that everyone can choose it like a built-in View.
5. As anyone placing a widget, I want a View Design to say how many Metrics it takes and of which kind (one, two, one with a Breakdown, several for small multiples), and to fill its Slots as with any Widget Template.
6. As someone presenting, I want a View Design to work wherever a widget does: dashboards, Snapshots, View Links, decks and the PowerPoint export.
7. As an analyst, I want to write an Analysis Recipe from verified building blocks, try it in the playground on Sample Data or my Metrics, and add it to the Workspace.
8. As anyone, I want every number an Analysis Recipe shows to be as verified as any other number in Ziffr.
9. As an Owner, I want to be sure that nothing imported can read data it was not given, send anything anywhere, or change anything.
10. As someone sharing designs, I want a file made today to still load after Ziffr grows its format.

## Implementation Decisions

- **One format for each, versioned, with a published schema.** `ziffr.view/1` and `ziffr.analysis/1` are JSON documents with a JSON Schema in `docs/reference/` and a TypeScript type in the core. Each carries its format version; Ziffr reads every version it ever published, and writes the newest.
- **View Designs:**
  - **Slots** say how many Metrics a design takes and what kind (a period, a Breakdown, several for small multiples), as Widget Templates do today.
  - **Marks** are a fixed list: line, area, bar, point, rule, band, text, gauge and table rows. Each mark says what it shows: a Metric's values, its target or Target Series, the Display Period's points, a comparison, or an Analysis Recipe's output. Numbers come only from the core's verified functions (`shownSeries`, `compare`, `formatValue` in the Number Style); a design cannot compute.
  - **Look:** colours, type and spacing come only from Theme tokens, so a design fits every Theme. Options a person may change when placing it (window, target band on or off) are declared with their types and defaults.
- **Analysis Recipes:**
  - **Steps** name functions from a fixed library (moving average, growth, difference, linear trend, seasonal index, standard deviation, z-score, correlation, share), each with typed parameters and a catalogue entry with its reference implementation (spec 0022).
  - **Output** is one or more series or single values with their unit, which a View Design draws.
  - **New functions** come into the library only through Ziffr itself, verified like every other calculation. A recipe can never add one.
  _Made precise in #150:_
  - **The library** (`packages/core/src/recipe-functions.ts`): `movingAverage` (window 2 to 60), `difference`, `growth`, `share`, `linearTrend` and `slope` (the line's fitted values and its rise are two functions, since a step gives a series or one value), `mean` (an average is a calculation: it is here, not a mark of the View Design format), `standardDeviation` (sample, n − 1), `zScore`, `seasonalIndex` (season length 2 to 53, by place in the series) and `correlation`. Each is exact on the values' text; the standard deviation and the z-score take the square root of the double nearest to the exact square, as Pearson's r does. Each has its row in the Calculation Catalogue, a reference in `test/reference/recipes.ts` with sums worked out by hand, generated tests, and 100 % coverage; the modules are calculation paths.
  - **The format**, `ziffr.analysis/1` (`analysis-recipe.ts`, schema generated into `docs/reference/analysis-recipe.schema.json`): Slots (1 to 4), steps (1 to 12; each names a function, its input as `slot1` to `slot4` or an earlier step, a second input where the function takes one, and its parameter), outputs (1 to 6, each a step with a label and a unit: the Metric's, percent or a plain number). The checks refuse an unknown function, a missing or extra parameter, a step that reads a later step or a Slot the recipe does not have, a step named twice or like a Slot, a value where a series belongs, and an output of no step, besides everything the View Design checks refuse. `runRecipe` (`recipe-run.ts`) applies the steps to the series it is given and nothing else.
  - **Forecast and correlation.** Correlation is a recipe (`analysis-recipes/correlation.json`): its one step is the same Pearson's r. The Correlation Analysis widgets stay built in, because they first combine a Metric of a shorter period to the other's longer one by its Aggregation (from complete periods), which happens before any step and is not one. The forecast stays built in: Holt's method feeds each smoothed level and trend into the next step, a recursion no composition of these functions writes exactly; adding Holt as a function would only rename the built-in. Ziffr ships seven recipes as starting points: moving average, growth, linear trend, seasonality, unusual periods (z-score), correlation and share of a total.

  _Made precise in #151:_ a View Design carries its recipe under `analysis` (the whole `ziffr.analysis/1` schema inside the design's), and its marks show a recipe's output as `recipe.` and the step: lines and bars of a series, a rule of one value, a text of one value or a series' latest. The checks refuse a `recipe.` without an analysis, of a step that is no output, a value drawn as a line or a series as a rule, and an analysis with more Slots than the design fills. The recipe's Slots are the design's first Metrics in order, each as the widget shows it (by its Display Period where the design offers Show by, and as of a Snapshot's day); `designRecipe` (`design-analysis.ts`) hands it those series and nothing else. Because the recipe travels in the design, and the design in the widget, Snapshots, View Links, decks and the export carry it with no more work; the PowerPoint export draws such a widget as a picture, its marks not being the values. The same-number test holds a recipe's moving average of a quarterly widget to the reference in a widget, a Snapshot and a View Link. In the Playground, **Start from** offers each built-in recipe inside a design that draws it (`designWithRecipe`).

- **Checks on import.** Schema validation with exact limits (file size, number of marks, steps and Slots, depth, length of every text). There are no web addresses, scripts, styles or HTML anywhere in a file. Text is always drawn as text. Unknown fields are refused, not ignored. The same checks run on the server whenever a design or recipe is saved, and in the playground as the person types.

  _Made precise in #146:_ the format is defined once, as a JSON Schema in `packages/core/src/view-design.ts`; the checks run that schema, and `docs/reference/view-design.schema.json` is generated from it (a test fails when it is out of date, and a second validator, Ajv, must agree with ours on the hostile-file table). The limits: 64 KiB, nesting 10 deep, 4 Slots, 12 parts at the top and in a group, 12 marks in a plot, 12 pieces in a text, 48 parts and marks in all, names up to 80 characters, descriptions 300, labels 60, texts 200. Every text is plain text: letters, digits, spaces and everyday punctuation, with no `<` or `>`, braces, brackets, backslashes or line breaks, and no `://`, `www.`, `javascript:`, `data:` or `url(`. A field given twice is refused, `__proto__` is read as an unknown field, never as an object's prototype. A file in a format version this Ziffr does not know is named as such. Each problem names its path and line.
- **One renderer.** `apps/web/src/views` gets one renderer that draws any View Design, used for every built-in View too. The built-in Views are rewritten as View Designs and kept as files in the repository. A test draws each one with Sample Data and compares the result with today's drawing, so moving them changes nothing on screen. The PowerPoint export reads the same design: the marks it can draw natively are drawn natively, and the rest become a picture.

  _Made precise in #147:_
  - **Which Views became designs.** Ziffr had 15 built-in Widget Templates, not 16. The nine that draw Metrics or an Analysis are View Designs in `packages/core/src/view-designs/`: Number + sparkline, Line chart, Bars per period, Gauge vs. target, History table, Forecast, Correlation, Correlation matrix and Drivers. Their Widget Templates (name, Slots, size, settings) are read from those files. The five Findings (ranked bars, part of the whole, 7 in 10, composed, annotated line) and the Free layout stay built in: a Finding is an editorial composition with words a person writes, Panels with their own Measures and Annotations anchored to rules, and a Free layout is a tldraw document. Neither is a drawing of values a design could describe without taking over that whole model, and neither is something a designer starts a new View from.
  - **What the format gained** so the nine fit without the renderer knowing any of them by name: two layout marks, `plot` (the axes, grid and scale that line, area, bar, point, band and rule marks are drawn against) and `group` (parts side by side or stacked); line weights; the option `display` (Show by), offered exactly where the Views offered it; points of `drivers.pairs`; rows of `correlations`, `matrix` and `reasons` (why a Metric was left out of a comparison). How a span still running or with gaps is drawn (dotted, open, hatched, spec 0018) is Ziffr's rule in every design, not the design's.
  - **Small changes that come with it.** The Gauge and the Forecast now declare the options they always honoured (`window` 12, `showTarget` on), so new widgets of them store those defaults. Drivers names its second Slot ("Compared with"), so placing it asks for the Metrics to compare with, and its Preview draws a ranking. A line and bars widget's chart is described to screen readers by its Display Period ("Revenue, 4 quarters, latest …"), as bars already were; a bar's tooltip looks like a line's.
  - **The comparison test** (`apps/web/src/views/drawings.test.tsx`) draws 45 cases (every design, with targets on and off, Show by, a span to date, a Snapshot, long and weekly series, approvals and Locks, another Number Style, empty and too-short Slots) in a browser-like document and compares every mark's shape, position and colour, every text and every title with files made by the Views as they were written before.
  - **PowerPoint** (`nativeForm` in `packages/core/src/design-export.ts`) decides by a design's marks, not its name: a plot whose one remaining mark is the values as a line or bars is a native chart, the target band and line and the forecast left out as before; rows of values a native table; texts of the latest value with its period and status a number; anything else a picture. The built-in designs export exactly as before.
- **Export and import.** **Export View Design** on any View, and **Duplicate as View Design** on a widget, give the file plus a matching Sample Data file, never the Workspace's values. The playground is a page under Analyze (`/analyze/playground`, GLOSSARY: Playground; _made precise in #149:_ only a design that passes the checks is drawn, the last good one stays while the text has mistakes, each mistake leads to its line, and the person's own Metrics fetch their series through the core like any canvas). Adding a design or recipe to the Workspace is for Owners and Admins, and audited. Members may save one as a team template, as today.

  _Made precise in #148:_ the Workspace keeps its designs in `view_designs` (at most 100, never in the demo); the core's `addViewDesign` checks the text on the server and writes `view_design.added` and `view_design.removed` to the Audit Log. A widget drawn by one has the template `design` and carries its own checked copy in its settings (`settings.design`), so Snapshots, View Links, decks and the export need nothing more, and removing a design from the Workspace changes no widget already placed. On a dashboard or in the Pool the core accepts only the Workspace's stored design of that id, or the copy the widget already had; on a slide or in a team template, any copy that passes the checks (a slide or template keeps what its widget had). The designs page is `/analyze/designs`. **Export View Design** and **Duplicate as View Design** are in every widget's menu that is drawn by a design; both download the design and a `ziffr.sample/1` file of Sample Data for its Slots. The `average` rule the format had since #146 is gone: an average is a calculation, and comes with the function library (#150).
- **Glossary.** Adds **View Design** ("A View written as a file: its Slots, its marks and what each shows, and its Theme colours. Ziffr draws it with its own renderer; it holds no code. Every built-in View is one. _Avoid_: Chart plugin, visualization plugin, custom widget") and **Analysis Recipe** ("An Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code, so every number it gives is verified. _Avoid_: Script, model, custom analysis, formula"). Changes **View** and **Analysis** to say they can be built in or added as a design or recipe.

## Testing Decisions

- **The format:** every built-in View as a View Design passes the schema; a table of invalid and hostile files (addresses, HTML, script-like text, oversized, deeply nested, unknown fields, wrong versions) is refused with the right message; text with markup is drawn as text.
- **The renderer:** each built-in View drawn from its design matches today's drawing for the same Sample Data; a design's numbers equal the core's for the same Metric and span (spec 0022's same-number-everywhere test gains View Designs and recipes).
- **Recipes:** each library function has its catalogue entry, reference and generated tests (spec 0022); a recipe's output equals the reference applied to the same steps; recipes cannot reach a Metric outside their Slots.
- **Round trip:** export, import and export again gives the same file.
- **The playground and the settings** are tried in the running app.

## Tickets

1. #146 The View Design format, schema and checks; the glossary.
2. #147 One renderer, and the built-in Views rewritten as View Designs with the comparison test.
3. #148 Export, **Duplicate as View Design**, import, and adding a design to the Workspace.
4. #149 The playground.
5. #150 The function library with its references (spec 0022's rules), the Analysis Recipe format, and forecast and correlation as recipes where their methods allow.
6. #151 Recipes in the playground and in widgets, decks and the export.
7. #152 Docs: a guide for designers and one for analysts, the user guide, the threat model.

## Out of Scope

- Running imported code of any kind, in the browser or on the server (see Further Notes).
- A public gallery or marketplace for designs and recipes.
- Editing a design with a drag-and-drop editor; the playground edits the file.

## Further Notes

- **Code plugins later, if files are not enough.** A View or Analysis that no file can describe would run in a sandbox: a frame on its own origin with no cookies, no network (`connect-src 'none'`), no navigation, receiving only its own widget's numbers by message and returning only a drawing or numbers. Only Owners and Admins could install one. Its results would be marked "Computed by …, not verified by Ziffr", because they are not. Analyses in Python could run in such a sandbox through WebAssembly (Pyodide). Programs that analyse outside Ziffr can already read values through the API and write results back, like Feeds. A scan of plugin code can be added as an extra, never as the protection.
- **Why not check imported code for malice.** No check can reliably tell harmless code from harmful code. The safety has to come from the design: no code in what is imported, and for later code plugins, a sandbox that limits what the code can reach.
