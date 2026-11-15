# Stories become Snapshots of a dashboard

Spec 0010 made the story its own thing, beside the dashboard: a title, an introduction and Findings in order. It is stored as a dashboard of kind `story`, and the only differences are a column instead of a grid and words on the widgets. Both are live and show the same numbers, so people could not tell when to use which. We fold the story back into the dashboard and add what a story really needs and a dashboard does not have: being fixed to a period.

A dashboard gets an introduction and a second way to read it (*Grid* to watch, *Read* top to bottom). A **Snapshot** is a dashboard as it stood for one period: its layout, its words and its values, stamped with that period. It is taken by hand or automatically once the period is complete. A Snapshot's numbers never change. Its words can still be written after it is taken, because the explanation of a month is written once its numbers are in. A dashboard lists its Snapshots ("October 2026", "September 2026", …), and they are the archive of what was known and said at the time. The word Snapshot already meant a deck's values at export, so it now covers both. Spec 0013 holds the details.

## Considered Options

- **Keep stories as their own thing** (spec 0010): rejected. The line between a story and a dashboard is only layout, and it did not hold up when we tried to explain it.
- **Merge without Snapshots:** a dashboard with words and a *Read* view, nothing more. Rejected: the words describe a month while the numbers keep moving, so a monthly update goes wrong the next month, and there is no record of what was reported.
- **Freeze the dashboard itself:** rejected. A dashboard's job is to stay current, and *Freeze* is already a word to avoid (GLOSSARY: Lock, Snapshot).

## Consequences

- There are three things again, each with one job: a dashboard watches (live), a Snapshot records and explains one period (fixed), and a deck presents (slides).
- Stories made under spec 0010 become dashboards. Nothing was released with them, so nobody outside the demo loses one.
- A Snapshot carries values the way a frozen View Link already does. Whoever may open the dashboard may open its Snapshots, and that rule needs the same care as View Links.
- Snapshots are stored, so a dashboard grows with every period. Their size is bounded like a View Link's payload.
- The `kind` column and its constraint from migration `20261128100000_stories.sql` stay, because migrations are add-only; every row becomes `dashboard`.
