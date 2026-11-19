# 0026 Paste from a spreadsheet: record many values at once

**Status:** draft. **Tracking issue:** #219 (label `tracking`); tickets carry `spec:0026`.

## Problem Statement

Most numbers people track already live in a spreadsheet: last year's monthly revenue, the weekly sign-ups a colleague keeps, the figures the bookkeeper sends at month end. To get them into Ziffr today, a person types each value into a personal form link, or answers one Prompt at a time, or asks someone to write a Feed. A year of twelve Metrics is 144 form submissions. People give up, or keep the history in the spreadsheet and only start Ziffr from today, which leaves every chart empty and every Comparison without a year before.

Copying cells is something everyone already knows how to do, in Excel, Google Sheets, LibreOffice and Numbers alike. Ziffr should take those cells as they are.

## Solution

One page, **Paste values**. A person copies cells from any spreadsheet and presses Ctrl+V (⌘V) on the page, or pastes into its text box. Ziffr recognises the layout (one value per row, or Metrics as rows and periods as columns), finds the Metrics by name or slug, reads the periods and numbers the way it reads an answer to a Prompt, and shows a preview: every cell with what it would do, such as recorded, unusual, locked, duplicate or refused, and why. The person removes what they do not want and confirms. Ziffr then records each value through the same core path as a form or a Prompt answer, with the Metric's Submission Rule, Locks, Unusual Value check and Approvals, and shows what became of each.

The browser only reads the clipboard's text and sends it. Reading, matching and every check run in the core on the server, for the signed-in person. No plugin, no add-on for Excel or Google Sheets, no call to Microsoft or Google: the clipboard's plain text is all Ziffr needs.

## User Stories

1. As a Member who keeps a spreadsheet of monthly values, I want to copy the block of Metrics and months and paste it into Ziffr, so that a year of history is in after one paste and one confirmation.
2. As them, I want to copy a long list of rows (Metric, period, value) from an export, so that any layout I already have works without rearranging it.
3. As them, I want to see before anything is recorded which cells Ziffr understood, which Metric and period each one went to, and what each would do, so that a mistake in my sheet does not become a wrong number in Ziffr.
4. As them, I want numbers written my way (1.234,5 or 1,234.5, with a currency sign or a percent sign as the sheet shows them) and periods written the way spreadsheets write them (2026-10, Oct 2026, 01.10.2026, Q3 2026, KW 46) to be read correctly, so that I do not have to reformat my sheet.
5. As them, I want a cell Ziffr cannot read to be named with its row and column and the reason, so that I can fix it in the sheet and paste again.
6. As them, I want to leave out single cells, rows or Metrics from the preview before I confirm.
7. As a Metric Owner, I want pasted values to meet the same Submission Rule, Locks, Unusual Value check and Approvals as every other value, so that pasting is no way around them.
8. As a Guest who submits values, I want to paste only for the Metrics I submit for, and to be told that others are not mine, without learning anything more about them.
9. As a person using a screen reader or only a keyboard, I want to paste into a text box and hear the preview's summary, so that the page works without a mouse and without seeing colours.
10. As an Owner, I want every pasted value to say in its history that it was pasted, by whom, so that I can tell it from a value answered to a Prompt.
11. Later: as a Member, I want to drop a CSV or XLSX file on the same page and get the same preview.

## Implementation Decisions

- **Where.** A page of its own, reached from the Metrics list ("Paste values") and from a Metric's history ("Paste history"), the latter starting with that Metric chosen for a two-column paste. It is a page of the web app for a signed-in person; it is not offered in the demo's personal form links or to Contacts, who have no login.
- **What the browser sends.** The clipboard's `text/plain` (spreadsheets put tab-separated rows there), or what was typed into the text box, as one string. `text/html` is not read: it carries the sheet's formatting, never more numbers. The browser does no reading of its own; the same core function reads a paste and, later, a dropped file's rows.
- **Reading the grid.** Rows split on line breaks, cells on tabs; a cell in double quotes may hold tabs, line breaks and doubled quotes (what Excel and Google Sheets write for a cell with a line break). Cells are trimmed; empty rows and columns at the edges are dropped. If there is no tab anywhere, a semicolon or comma separator is tried as a CSV would be, but only when every row splits into the same number of cells; otherwise the paste is refused with "Copy the cells from the spreadsheet itself".
- **Recognising the layout.** Two layouts, tried in this order:
  - **Wide:** the first row holds periods from its second cell on, and the first column holds Metrics from its second row on. Each inner cell is the value of its row's Metric for its column's period. Transposed (periods down the first column, Metrics across the first row) is recognised the same way.
  - **Long:** each row holds a Metric, a period and a value, in any order of the three columns; a header row ("Metric", "Period", "Value" or the words of the Answer Languages) is skipped when present. A fourth column is allowed only when it is empty everywhere.
  - **Two columns for one Metric** (period, value) when the page was opened for a Metric, or when the person picks the Metric above the paste.
  The layout found is said above the preview in words ("Metrics as rows, months as columns: 12 Metrics × 24 months"), with a switch to the other reading when both fit. Anything else is refused with what Ziffr expected.
- **Finding the Metric.** A cell names a Metric by its name or slug, compared without case, spaces at the ends or repeated spaces. Only Metrics the person may see are looked at; of those, only Metrics they submit for are recorded (below). A name that matches two Metrics they see is ambiguous and refused with both slugs offered as the way to say which. A name that matches nothing they see is "not a Metric you can see here", the same words whether it exists or not.
- **Reading periods.** A period cell is read with the core's period words (`findPeriodWords`, the Workspace's Answer Languages and Fiscal Year) and, in addition, the dates spreadsheets write: ISO dates and months (`2026-10-01`, `2026-10`), dates in the Workspace's day and month order (`01.10.2026`, `10/1/2026`), and a spreadsheet's date serial is never guessed. A date inside a Metric's period counts as that period ("2026-10-15" is October for a monthly Metric), as a dropped-in daily date column commonly is; the preview shows the period's name, so a misreading is visible. A period of another length than the Metric's (a month for a weekly Metric) is refused, never split or combined. Future periods are refused, as everywhere.
- **Reading numbers.** Each value cell is read with the core's `readNumber` and the Workspace's Number Style, so "1.500" reads as the Workspace reads it in every answer. Spreadsheets copy what a cell shows, so a currency sign or code and a percent sign around the number are taken off before reading, but only when they match the Metric's unit (a "€" for a Metric in euros, a "%" for a percent Metric); a "%" on a Metric whose unit is not a percent is refused rather than divided by 100. Accounting negatives in brackets ("(1,200)") read as negative. An empty cell is no value and is skipped, not refused. "#N/A", "#DIV/0!" and other spreadsheet errors are refused by name.
- **The preview.** One row per value found, grouped by Metric, with the cell's place in the sheet (row and column as the spreadsheet names them, such as C7), the Metric, the period's name, the number as Ziffr will store it, and its outcome:
  - **recorded:** it would be recorded as it stands;
  - **replaces:** the Submission Rule overwrites a value already there (the old value is shown, since the person may see it);
  - **adds up / kept beside:** the rule adds it to or keeps it next to the one there;
  - **unusual:** it would be recorded, and the Metric's Workflow would ask for Approval (the reasons, as the check gives them);
  - **locked:** the period is Locked, so it would become a proposed Correction to the Metric Owner;
  - **duplicate:** the period has a value and the rule rejects a second one, or the paste itself holds two values for the same Metric and period (both are refused, never one picked);
  - **refused:** with the reason (not a Metric you submit for, a Derived Metric, the Metric does not take values this way, the period is in the future, not a number, and so on).
  Above it, a summary in words ("118 to record, 4 unusual, 2 locked, 6 refused") that is also announced to screen readers. The outcome is a word, with a colour only beside it.
  The preview is computed by the core without writing: the same rules `submitValue` and the Workflow apply, run as a dry run (`previewValues`), so the preview and the recording cannot disagree on any rule. It reads the values already there at that moment.
- **Confirming.** The person can leave out cells, rows or Metrics; then **Record N values**. The browser sends the pasted text again with the places left out, never the parsed values: the core reads it again and records each value through `submitValue`, one after the other, in period order per Metric (so the Unusual Value check compares each month with the month before as it now stands). If something changed since the preview (a colleague recorded a value, a period was Locked), the value gets the outcome it gets now, and the result says so. The result page lists what became of each value, like the preview, and links to each Metric.
- **Whose rights, and which Source.** The person pastes as themselves, the actor of the core call. A value is recorded only for a Metric they submit for, through a Token they hold for it: their own, or one they hold as the Stand-in of someone Away, as the personal form link does. Metrics they only see are refused as "not a Metric you submit for"; Metrics they do not see are never named. A Guest pastes on the same terms. An Owner or Admin has no more rights here than as a submitter: pasting values for someone else's Metric means being made its submitter first.
  The **Source** is the web form, the Source a signed-in person's own values already arrive on: pasting is a way of filling in the web form, not a new Connector, so a Metric that has turned the web form off refuses pasted values too (see Open questions). The intake log records each value with the cell's text, the sender, and the mark `paste`, and the Metric's history shows "pasted by Ana" next to the value.
- **Not an Import.** Pasted values for past periods are ordinary values: they meet the Unusual Value check and Approvals, unlike a Feed's Import. A paste of two years of history can therefore ask an Approver many times; the preview says so before confirming ("14 values would ask Ana for Approval"). Whether some people may paste history as an Import is an open question below. In UI text a paste is never called an import or an upload ("Import" is a Feed's history; "upload" is an _Avoid_ word for Observation).
- **Limits.** At most 256 KB of text and 2,000 values per paste, checked on the server before reading (the browser says so before sending as well). At most 10,000 pasted values per person per day across all their pastes, counted in the database like the API's values per key; a paste that would cross it is refused whole before anything is recorded, with the number left. Reading and the preview run in the request; a paste over the limits is refused, not cut.
- **Breakdowns** are out of this spec's first step: a pasted value is the Metric's number. A Breakdown in a paste is a later ticket.
- **Effects.** Each recorded value sets off what a value always sets off (the Workflow's check, Approvals and their Deliveries, the Metric Owner told of a Correction). No extra message is sent per paste.
- **Accessibility.** The page has a labelled text box that takes a paste or typing, so the page does not depend on a page-wide paste handler; Ctrl+V anywhere on the page puts the paste into it. The preview is a table with headers; the summary is in a live region; leaving out a cell is a checkbox with the cell's place and Metric as its label; every outcome is a word.
- **The user guide** gets a section in chapter 10 (Metrics), "Paste values from a spreadsheet": the two layouts with a small example each, how numbers and periods are read, what each outcome means, and the limits. It is checked in CI with the screen (`docs/user-guide`).
- **Later: dropped files.** A CSV dropped on the page or picked is read in the browser as text (it is text) and goes through the same core function as a paste. An XLSX is a zip of XML: reading it needs either a library in the browser or one on the server. Neither is chosen here; see Open questions. Either way the file's sheet becomes the same grid of cell texts as a paste, and only that grid reaches the core.

## Testing Decisions

- **Pure tests** for reading the grid (tabs, quoted cells with tabs and line breaks, doubled quotes, CSV fallback, uneven rows refused), recognising each layout and its transposed form, header rows, period cells (ISO dates and months, the Workspace's date order, period words in two Answer Languages, a date inside a period, a period of another length, future periods), and number cells (both Number Styles, ambiguous "1.500", currency and percent matching the unit or not, brackets, spreadsheet errors, empty cells). Fixtures are cells as Excel, Google Sheets, LibreOffice and Numbers put them on the clipboard, captured once and kept in the repository.
- **Database tests** (`paste-values.db.test.ts`) for the preview and confirmation against the real Workspace rules: only Metrics the person submits for are recorded; a Metric they see but do not submit for is refused, one they do not see is never named; a Stand-in's Token works while the person they stand in for is Away; each Submission Rule's outcome; a Locked period becomes a proposed Correction; an Unusual Value asks for Approval; two cells for the same period are both refused; a value recorded by someone else between preview and confirm gets its outcome at confirm; the preview writes nothing; the per-paste and per-day limits; a Metric with the web form turned off; the demo.
- **The preview and the recording agree:** a property test runs random pastes against a fixture Workspace and checks that every recorded value's outcome is the one the preview gave when nothing changed in between.
- **In the browser:** pasting from each of the four spreadsheet programs once by hand before the first release, recorded in the pull request; a keyboard-only and screen-reader pass of the page.

## Tickets

1. The core reader: grid, layouts, Metrics, periods and numbers, with pure tests and clipboard fixtures. No page yet.
2. `previewValues` and `recordPastedValues` in the core (dry run and recording through `submitValue`, Tokens, limits, intake mark), with database tests. Blocked by 1.
3. The **Paste values** page: text box and page-wide paste, preview table with leaving out, confirmation and result; entry points from the Metrics list and a Metric's history; user guide section; release note. Blocked by 2.
4. "Pasted by" in a Metric's history and the intake log. Blocked by 2.
5. Dropped CSV files through the same preview. Blocked by 3.
6. Dropped XLSX files, once the open question on where to read them is settled. Blocked by 5.

## Out of Scope

- Breakdowns, Target Series and Projections in a paste (later tickets, same reader).
- Creating Metrics from a paste: a name that matches no Metric is refused, never made into one.
- Pasting in the API or the MCP Server: programs already submit values one by one or as a Feed's batch.
- Any plugin or add-on for Excel, Google Sheets, LibreOffice or Numbers, and any call to Microsoft or Google.
- Reading formulas, cell formats or colours: only what the cell shows.
- Undoing a whole paste in one step; each value is corrected like any other.

## Open questions

1. **Which Source does a pasted value arrive on?** Recommendation: the web form, as decided above. A paste is the signed-in person filling in the web form many times, and a Metric that turned the web form off means "not by hand". The alternative is a new Source "Paste" that each Metric turns on or off, which lets an Owner allow Prompts answered by form but no pasting of history; it adds a Source that is not a Connector, against the glossary's definition. Decide before ticket 2.
2. **May history be pasted as an Import, skipping the Unusual Value check?** Pasting two years of a Metric that has a Workflow with a check can send dozens of Approvals to one person. Recommendation: yes, but only for periods that have no value yet, only by the Metric Owner or an Owner or Admin, as an explicit choice in the preview ("Record as history: no Unusual Value check, marked as imported"); everyone else's pasted values are checked. This widens the glossary's Import, which today belongs to Feeds only, so the glossary changes with it. Alternative: no Imports from a paste at all, and Approvers live with the burst. Decide before ticket 2.
3. **Limits.** Recommendation: 2,000 values and 256 KB per paste, 10,000 values per person per day, as above. Are those right for the largest sheets people will bring (for example ten years of a daily Metric is 3,650 values, more than one paste)?
4. **Where is an XLSX read: in the browser or on the server?** In the browser, a library such as SheetJS runs on the person's machine and only the grid reaches Ziffr, so a crafted file never reaches the server; it adds a sizeable script to that page. On the server, the file is untrusted input to a zip and XML parser (zip bombs, entity expansion) inside the core. Recommendation: in the browser, loaded only on that page, with the grid sent as text exactly like a paste. Decide before ticket 6.
5. **The page's name and place.** Recommendation: "Paste values" in the Metrics list and "Paste history" on a Metric. Alternatives: a "Record values" page that also takes typed values for several Metrics at once.
