# 0065: Delete Metrics, with their record first

**Status:** done

## Why

Deleting was one Metric at a time, named only how many things stood in the way, and gave nothing to keep. People who tidy up a Workspace want to pick several Metrics, see once what can go and why the others cannot, take a copy of everything with them, and then delete. And a past Snapshot should keep showing what it showed.

## What

1. **One flow.** "Delete…" in the Metrics list's bar for the ticked Metrics (at most 50), and **⋯ → Delete…** on a Metric's page, open the same window.
2. **One preview.** Which Metrics can be deleted and which cannot, each with the reason: not yours; calculated from it or added up by a Total that is not picked too; on a dashboard, in a deck or in saved widgets you cannot change; a working View Link only someone else revokes; the demo. Names only of what the person may see; the rest is counted.
3. **Changes ticked on purpose.** Take them off dashboards, take them out of decks, revoke the View Links, each listing what it changes. A widget that shows one list keeps the others; any other widget naming a picked Metric goes whole; a text box keeps its words and shows nothing for the Metric; Snapshot Parts stay. The changes are made by the same operations as by hand.
4. **Order.** Picked Metrics that read each other are deleted readers first.
5. **The record.** One ZIP with, per Metric, its definition, values and their history, Breakdowns, targets, Projections, Questions, Tasks and replies, and calculated numbers, as CSV files written like every CSV file of Ziffr (formulas guarded, Number Style, byte-order mark). Delete unlocks only after this download, **checked on the server**: the download is written in the Audit Log with a fingerprint of what it held, and deleting asks for the fingerprint of exactly this set as it is then. A download counts for 24 hours.
6. **Confirm** by typing the Metric's name, or "delete N Metrics". **Archive instead** stands beside it.
7. **Past Snapshots keep their copy.** Deleting writes down which Members and Guests see the Metric at that moment (before it is taken off any dashboard). They keep seeing it, marked "(deleted)", in Snapshots they may still open, on slides that draw those Snapshots and through View Links to a Snapshot. Nobody else gains anything; leaving the Workspace ends it. This holds for every deletion, also by a program.

## Rights

Only the Metric Owner deletes, as before. A dashboard or deck is changed only by its owner and Editors, a View Link revoked only by the owner of what it shows. Nobody gains a right.

## Not in this

- The API's and the MCP Server's deletion keep their behaviour: no record asked, refused while anything uses the Metric.
- Metrics deleted before this stay unseen in old Snapshots: who saw them then is not known.
- The record cannot be imported.

## Done when

- Database tests cover the preview's reasons and what it hides, the record's contents and who gets it, the refusal without or with a stale download, each ticked change, the order, and who sees a deleted Metric in a Snapshot.
- The window works at 390 and 320 wide, light and dark.
- The user guide describes it.
