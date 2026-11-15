# 0011 Previews of Widget Templates, saved widgets and Metrics

**Status:** done. **Tracking issue:** #164 (labels `tracking`, `ready-for-agent`); tickets will carry `spec:0011`.

## Problem Statement

Nobody can see what a Widget Template looks like before using it. The fifteen built-in templates are a label and a one-line blurb in the widget's ⋯ menu under "Change visualization", so restyling a widget means trying each one in turn; a team template in the Pool is a name, "2 slots, by Anna" and a tooltip; a saved widget is its title and its view's label. To find out, you drop it on a canvas, fill its Slots, look, and remove it again.

The built-in templates are not in the Pool at all. A new widget starts as the default template (number + sparkline) and is restyled afterwards, so an analysis such as Correlation or Drivers is only found through Analyze, and a Finding template only by opening a widget's menu. The Pool itself is there only in edit mode (spec 0010), which is where templates are used.

## Solution

- **Previews in the Pool.** Pointing at or focusing a template or a saved widget in the Pool shows its Preview beside the list: the widget drawn at its own proportions, with its name and what it is for. Nothing is placed until it is dragged or added.
- **Built-in templates in the Pool.** The Pool's Templates section lists the built-in templates (grouped as Views, Analyses, Findings, Layout) above the team's own. Adding one asks for its metrics, the same way a team template asks for its Slots.
- **Browse templates.** A "Browse…" button on the Templates section opens a dialog: a grid of Previews, every built-in and team template, filtered by name and grouped as above. "Use" adds it to the canvas the Pool belongs to, as the Pool's + does.
- **Sample Data.** Templates have no metrics, so their Previews draw made-up series: the same for every viewer, never a workspace's numbers, labelled "Sample data".
- **Previews when restyling.** In a widget's "Change view" menu, the highlighted option shows a Preview of that widget redrawn with it: its own metrics, its own settings. Nothing changes until the option is picked.
- **Previews of Metrics (optional, last).** A Metric in the Pool can show a Preview of the widget it would become when dropped (number + sparkline), opened from its ⓘ button only, not on pointing.
- **Your metrics before placing.** When a template asks for its metrics, the slot dialog shows a Preview with the metrics chosen so far, so you see the result before it lands on the canvas.

## User Stories

1. As a member building a dashboard, I want to see what a template looks like before I place it, so I do not drop, look and remove.
2. As a member, I want to find analyses and Finding templates where I find metrics and widgets, so I do not need to know they hide in a widget's menu.
3. As a member, I want to browse every template at once, larger than the Pool's list, so I can compare them.
4. As a member who saved widgets, I want to recognise them by how they look, not only by title.
5. As a member using a team template, I want to see it filled with the metrics I picked before it is placed.
6. As a member restyling a widget, I want to see it in each view before I switch, so I do not switch, look and switch back.
7. As a member, I want to glance at a Metric's recent trend in the Pool before I drop it.
8. As a Guest, I want to see Previews of templates without seeing numbers I may not see.
9. As a member on a phone or using a keyboard, I want Previews without a mouse.
10. As a demo visitor, I want every Preview to work.

## Implementation Decisions

- **Words.** Two new glossary terms, added by the first ticket: **Preview** ("A Widget Template or saved widget drawn small before it is placed, without its menus") with _Avoid_: thumbnail, mock-up; **Sample Data** ("Made-up series that a template's Preview draws when it has no metrics; never a workspace's data") with _Avoid_: dummy data, fake data. The Pool's glossary entry gains "and templates". There is no "library" or "gallery": the dialog is called "Browse templates", and the glossary keeps "Template library" as an _Avoid_ word.
- **Sample Data lives in the core.** A pure module, `packages/core/src/sample-data.ts`, makes a few made-up Metrics (`sampleMetrics(grain)`), each with a series of 24 periods, a target, a Breakdown of five rows and a derived second series that moves with the first, so Correlation, Drivers and the Finding templates have something to draw. It is seeded, so the same Preview looks the same every time and in every test. Sample metrics carry negative ids, so nothing that saves can mistake one for a real Metric; and the core already refuses one wherever a Metric id comes in from outside: `assertSeesMetrics` accepts only Metrics the actor sees, and no Metric has a negative id. Dropping such ids silently instead would turn that refusal into an empty widget, so the rule stays as it is and a database test pins it.
- **Drawing a Preview.** A `Preview` component in `apps/web/src/components/preview.tsx` draws the read-only card a View Link shows (`read-only-frame.tsx`, moved out of `WidgetFrame` so a Preview loads none of the menus or server actions) inside a box scaled to the template's `size`, `inert` and `aria-hidden`, with the name and blurb as text beside it for screen readers. For a template it builds a `CanvasData` from Sample Data alone, so drawing it fetches nothing. A free layout's Preview is a small sketch, because drawing a real one loads tldraw. In the Pool the Preview sits in a portal, because an ancestor of the Pool turns `position: fixed` into its own coordinates and clips it.
- **Team templates draw Sample Data, never their example metrics.** A Slot's `exampleIds` are the metrics the template was made with, and the viewer may not see them all. A Preview fills each Slot with sample metrics (as many as the Slot had examples, for small multiples), its Placeholders from those, and keeps the template's own words and annotations. Comment this in `preview.tsx`: it is the reason a Preview never needs a Share check.
- **Saved widgets draw their own metrics.** A saved widget is the viewer's own, so its Preview uses the viewer's data through the series store the Pool already warms on pointing (`useEnsure`). A metric the viewer can no longer see draws as it does on a dashboard today; a Preview never shows more than placing the widget would.
- **Built-in templates ask for their metrics.** `TemplateDef` gains `slots: Slot[]`, in `widget-templates.ts`: one metric for Views, Forecast and Drivers; two for Correlation; one or more for Correlation matrix; one with a Breakdown for the Finding templates that need one; none for "Finding: composed" and "Free layout". Adding a built-in from the Pool or the dialog opens the slot dialog with these Slots and then places a `{ type: "spec", template, metricIds }` drop source, which `placeWidget` already checks on the server. A template without Slots is placed empty, as it can be today.
- **Restyling.** The "Change view" submenu in `widget-frame.tsx` shows a Preview of the highlighted option next to the menu, at once: moving through a menu is already deliberate. For a built-in it draws the widget as it is, with only `template` swapped, from the data the widget already draws: no fetch, nothing the viewer does not see on the card already. For a team template listed there it draws Sample Data, as in the Pool, since its words and annotations come from someone else's widget. The menu is offered only where the widget is `editable`, as today. The same ticket renames the submenu from "Change visualization" to "Change view": the glossary's word for a way of drawing a Metric is View, and it lists "visualization plugin" under _Avoid_. The tour (`tour.tsx`), the toast after saving a template (`save-template-dialog.tsx`) and the doc comment on `applyTemplate` (`canvas-actions.ts`) name the menu too and change with it.
- **Metrics in the Pool (optional).** A Metric's Preview is the widget a drop would place (`DEFAULT_TEMPLATE` with its settings), drawn from the series store the Pool already warms on pointing. It opens from a ⓘ button on the row, never on hover: the Metrics list is the longest part of the Pool and is dragged from all the time, and a popover on every pass would get in the way. It shows only Metrics the viewer can see, because the Pool lists only those.
- **The slot dialog shows a Preview** with the metrics chosen so far, once every Slot is filled. These are metrics the viewer picked from those they can see, drawn from the series store like any widget.
- **Showing it.** In the Pool, a Preview opens after 300 ms of pointing or at once on keyboard focus, beside the Pool on wide screens and below the row on narrow ones; Escape closes it. On touch, a row's ⓘ button opens it. Only one is open at a time.
- **Cost.** Previews in the dialog draw only when scrolled into view and stay drawn afterwards. Sample Data is made once per grain and kept in memory. No new route, server action, table or migration.
- **Decks.** The Pool in the deck editor gets the same Previews. Slide layouts under "+ Slide" are out of scope here (see below).

## Testing Decisions

- **Sample Data:** unit tests that it is the same on every call, covers every grain, has a Breakdown and a second series that moves with the first, and that every id is negative.
- **Every built-in template draws:** a test that renders `Preview` for every `TemplateId` with Sample Data and fails if one throws or draws nothing. If `apps/web` has no component test setup yet, the ticket adds a small one (Vitest with jsdom) for this test only.
- **Slots for built-ins:** a unit test that every `TemplateDef` has `slots`, and that `fillsComplete` accepts what the slot dialog makes for each.
- **Restyle Preview:** a test that the Preview for each option in "Change view" draws the widget's own metrics and settings with only the template changed.
- **No real data in a template's Preview:** a test that the `CanvasData` built for a team template's Preview holds only sample metrics, whatever its `exampleIds` say.
- **Negative ids refused:** a database test that `placeWidget` with a spec drop source naming a negative metric id is refused.
- **In the running app** at 1440 and 390 pixels wide, signed in and in the demo, as a Member and as a Guest: Pool previews by mouse, keyboard and touch; Browse templates; Previews in "Change view" on a dashboard you may edit, and no such menu on one you may not; a Metric's Preview from its ⓘ button; adding a built-in analysis and a Finding template; a team template's slot dialog preview.

## Out of Scope

Previews of slide layouts and slide templates under "+ Slide" (a slide layout is shapes in slide coordinates styled by the deck's Theme, which `WidgetFrame` cannot draw; it needs a renderer built on the theme editor's `SlidePreview` and belongs in a deck spec); letting a viewer choose to preview a team template with their own metrics before the slot dialog; templates made by others outside the workspace (a shared or public template catalogue); static images of Previews made on the server.

## Further Notes

- Tickets, in order (#165 to #172): (1) glossary terms and Sample Data module with its tests; (2) `Preview` component and the every-template render test; (3) `slots` on built-in templates and adding them through the slot dialog; (4) Previews in the Pool, mouse, keyboard and touch; (5) Browse templates dialog; (6) Preview in the slot dialog; (7) Previews in "Change view"; (8, optional) Previews of Metrics in the Pool. Tickets 4 to 8 each need a release note in `.changeset/`.
- `TEMPLATES` carries a PROTOTYPE note that each built-in will become a pluggable View; Sample Data and `slots` belong to a View when that happens, so keep both keyed by `TemplateId`, not by a list position.
