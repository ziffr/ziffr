# Google Sheets to Ziffr (Automation Template for a Feed)

One n8n workflow that reads a sheet every morning and sends the numbers in it to Ziffr as the values of your Metrics. It is an [Automation Template](../../GLOSSARY.md): a file in this repository that you import into your own n8n. Ziffr never runs it and never holds your Google account; the Feed Key it sends with lives in an n8n credential. It is the way to fill Metrics from numbers somebody already keeps in a spreadsheet, such as headcount, absence or the month's costs, without anyone retyping them. It sends through a [Feed](../guides/feeds.md), the same way as a program written with `@ziffr/feed-kit`.

**Tried against a real n8n and Google Sheets:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`google-sheets-feed.json`](google-sheets-feed.json) | Google Sheets to Ziffr | Every day at 9: reads the sheet, checks each row, sends the good ones to the Feed endpoint, and fails the run if Ziffr refuses a value. |

## The sheet

One row per value, with a header row and these columns (the order does not matter, other columns are ignored and never leave the sheet):

| Column | What it holds |
|---|---|
| `metric` | The Metric's slug, as Ziffr shows it in the Metric's address (`headcount`, `monthly-absence`): lower case letters, digits and hyphens. |
| `value` | A plain number: `42`, `3.5`, `-12`. No percent sign, no thousands separator, no unit. |
| `period` | Optional. The first day of the period the value is for, written `2026-10-01`. Left empty, the value is for the current period. Use it to fill past months. |

A row Ziffr would refuse (a name that is not a slug, a value that is not a number, a period that is not a day, the same Metric and period twice) is skipped, and the run's output says which row and why. Empty rows are ignored. At most 500 rows are sent in one run; the rest are skipped.

## Set up

1. In Ziffr, **Settings → Feeds**: make a Feed, and make a Feed Key for it with an end date within a year. Copy the key (shown once).
2. On each Metric the sheet should fill, open **Who submits** and add the Feed. A Metric that does not take values through a Feed, or is not one the Feed submits to, is refused with `not_found` or `source`.
3. In n8n, import `google-sheets-feed.json` (**Workflows → Import from file**).
4. Open the **Settings** node and fill in your Ziffr address, the sheet's id (the long string in its address, between `/d/` and `/edit`) and the name of the tab.
5. Add the credential **Google Sheets OAuth2 API** in n8n and choose it in **Read the sheet**.
6. Add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **Send to Ziffr**. Keep the key in the credential, never in the workflow, so that you can share the workflow.
7. Press **Execute workflow** once. In Ziffr the Metrics show the values, from "Feed". Then activate the workflow: it runs every day at 9 (n8n's time zone).

## What it does with a value

- **A value for the current period** is checked as any value is: an Unusual Value waits for Approval, and a Workflow that approves every value holds it. A past period that has no value is an **Import**, recorded without that check and marked as imported; a past period that already has one is refused (usually as `duplicate`), so rerunning the workflow does not change what is there.
- **Running twice records nothing twice.** The same rows send the same key, so a retried run replays Ziffr's first answer. Changed rows send another key, so a corrected number is sent again, and Ziffr decides what to do with it as with any second value for a period.
- **A refused value fails the run**, so n8n shows it as failed and whoever watches it looks. The other values of the run were recorded all the same, each stands on its own.

## Limits

- **Numbers only.** The template does not read formatted cells (`12 %`, `€ 1,200`): make a column that holds the plain number, with a formula if needed.
- **One sheet, one tab.** For several, import the workflow again for each.
- **Ziffr allows 10,000 values a day** per Feed unless the Installation set another limit, and one batch of at most 500 at a time.
- **The key can write values for its Feed's Metrics and nothing else.** It cannot read a value or see a person. Still, it is a secret: if it leaks, revoke it in Ziffr under **Settings → Feeds** and make another.
- **The sheet's owner decides what is sent.** Whoever can edit the sheet can change a Metric's value. Share the sheet as you would share the numbers.
- **Google can change.** If the Google Sheets node of a newer n8n asks for other settings, import the workflow again from this repository or fix the node; a template that stops working is fixed by a pull request.
