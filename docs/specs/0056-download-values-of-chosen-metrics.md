# 0056 Download the values of chosen Metrics

**Status:** draft. Asked by the owner on 2026-11-26. Tracking issue and ticket: to be opened when this merges (label `spec:0056`).

## Problem Statement

A person who wants their numbers in a spreadsheet, a report or another tool has no way to take them out of Ziffr themselves, except two:

- **Download the values** under Workspace settings, for Owners and Admins only, always for every Metric they see.
- The Workspace Export, for the Owner only, which another Ziffr reads and a spreadsheet does not.

A Member who owns three Metrics, an analyst who is shared ten, or a Guest who wants the one Metric shared with them cannot take its history. Choosing "all of them" when they want two is also awkward: the file is large and has to be cut by hand.

Importing history in bulk already works (Paste values, Record as history, Feeds). Taking it out again does not, and "can I get my data out" is the second thing people ask after "can I get it in".

## Solution

A person ticks Metrics in the Metrics list, or opens one Metric, and downloads their values as one CSV file.

- **In the Metrics list**, each row has a checkbox. A bar appears when something is ticked: "3 selected", **Download values** and **Clear**. A **Select all** box in the table head ticks the Metrics the list shows (after Tag and Archived filters). Nothing is ticked by default and nothing is downloaded without a click.
- **On a Metric**, the History tab has **Download values** next to **Paste history**: the same file for this one Metric.
- **The file** is the one the Workspace download writes, so a person who knows one knows both: one row per value, oldest first per Metric, columns `metric` (slug), `name`, `period`, `period_start`, `value`, `unit`, `source`, `recorded_at`, `period_end`, `condensed_from`; the Workspace's Number Style, a `;` separator where the decimal mark is a comma, every field quoted, and a leading apostrophe on text that a spreadsheet would run as a formula. A Condensed Value is one line for its span.
- **Who:** every signed-in person in a Workspace, for the Metrics they may see: an Owner, an Admin, a Member, and a Guest for what is shared with them. The Metric Owner needs no other right. Reading is what the person could already do on screen; the file adds nothing they could not copy by hand.
- **Not:** an Access Key (a program reads values through the API already, with its own scopes and its own log), a View Link, a visitor of the demo, or a Contact.
- **Limits:** at most 50 Metrics and 250,000 rows in one download. Over the limit the person is told in words how to split it, and nothing is cut short. A Derived Metric has no values of its own and contributes no rows; the bar says so when one is ticked ("Revenue per head is worked out from other Metrics and has no values of its own").
- **Archived Metrics** can be ticked under the Archived view and downloaded: their values are kept.
- **A value waiting for Approval** is in the file as the API and the History tab show it to people who see the Metric; the file does not change what they see.
- **Audit Log:** each download is written as `export.metric_values`, "downloaded the values of N Metrics", with counts only (Metrics, rows), never a name or a value. Not recorded in the demo, where it is refused.

## What the core does

`exportMetricValues(actor, slugs)` in `packages/core` takes the Actor first and:

1. refuses an Access Key, the demo and a person who is not a Member or Guest of the Workspace;
2. reads the Metrics of the Workspace and keeps those the Actor may see: a slug that does not exist and a slug the person may not see answer the same way (it is left out, never named), and when none is left the call fails with "Pick at least one Metric you can see";
3. refuses more than 50 Metrics, and more than 250,000 rows (counted by the database before any is read);
4. writes the CSV with the existing `valuesCsv`, which reads observations, opens sealed columns with the Workspace Key and leaves a value that does not open out of the copy;
5. writes the Audit Log line.

The route `GET /metric-values?metric=slug&metric=slug` (not under `/metrics/`, where a Metric whose slug is "export" would be shadowed) only passes the slugs (strings, at most 50, each at most 100 characters; nothing is ever built into a query filter) and the person; it answers `text/csv` with `no-store`, and refuses a request another site made for the person's browser, as the retention download does.

## Out of scope

- Breakdown rows, Targets, earlier (superseded) values and Projections. They stay in the Retention download and the Workspace Export; a later spec may add them as options.
- Excel (.xlsx) files. A CSV opens in every spreadsheet; the number style is already handled.
- A date range. Everyone's first question is "all of it"; a range is a later filter.
- Programs: the API's metric endpoint stays the way to read values; a bulk endpoint for Access Keys is a separate decision about scopes.
- Scheduled or emailed exports.

## How we know it is done

- A Member ticks two Metrics in the list and gets one CSV with exactly those two Metrics' values, in the Workspace's Number Style.
- A Guest downloads a Metric shared with them; the same request naming a Metric not shared with them returns a file without it, with nothing to tell the two cases apart, and a request for only such Metrics fails with the same words as for unknown ones.
- An Access Key, a visitor of the demo and a request from another site get a refusal.
- 51 Metrics are refused with words; a file over the row limit is refused, never cut short.
- The Audit Log has one line per download, with counts.
- A database test covers who may and the file's columns; the user guide's Metrics chapter and the glossary are updated; a release note is written.

## Tickets

1. Core: `exportMetricValues`, the route, the audit kind, database test.
2. Metrics list: checkboxes, the bar, **Download values** on a Metric's History tab; user guide, glossary term, release note.
