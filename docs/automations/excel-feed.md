# Microsoft Excel to Ziffr (Automation Template for a Feed)

One n8n workflow that reads a table in an Excel workbook every morning and sends the numbers in it to Ziffr as the values of your Metrics. It is an [Automation Template](../../GLOSSARY.md): a file in this repository that you import into your own n8n. Ziffr never runs it, never reads your workbook and never holds your Microsoft login; the Feed Key it sends with lives in an n8n credential. It is for numbers somebody already keeps in Excel, such as headcount, absence or the month's costs, without anyone retyping them. It sends through a [Feed](../guides/feeds.md), the same way as the [Google Sheets](google-sheets-feed.md) template, and it is built on the same shared steps and tested by the same checks.

**Tried against a real n8n and Excel:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`excel-feed.json`](excel-feed.json) | Excel to Ziffr | Every day at 9 (UTC): asks Ziffr which periods are filled, reads the table, checks each row, sends the good ones to the Feed endpoint, and fails the run if Ziffr refuses a value. |

## The table

The workbook must be on **OneDrive or SharePoint** (n8n reads it through Microsoft's online service; a file that lives only on one computer cannot be reached). In it, make an Excel **table** (select the cells, **Insert → Table**, with headers) with these columns. The order does not matter, other columns are ignored and never leave the workbook, and capitals in a header do not matter:

| Column | What it holds |
|---|---|
| `metric` | The Metric's slug, as Ziffr shows it in the Metric's address (`headcount`, `monthly-absence`): lower case letters, digits and hyphens. |
| `value` | A plain number: `42`, `3.5`, `-12`. Not text, not a percent (a cell that shows `12 %` holds `0.12`: use a column that holds the number you mean), no unit. |
| `period` | Optional. The first day of the period the value is for. A date cell works (`2026-10-01`; Excel keeps it as a number, and the template turns it back into the day), and so does text written `2026-10-01`. Left empty, the value is for the current period. Use it to fill past months. |

A row Ziffr would refuse (a name that is not a slug, a value that is not a number, a period that is not a day, the same Metric and period twice) is skipped, and the run's output says which row and why. Empty rows are ignored. At most 500 rows are sent in one run.

## Set up

1. In Ziffr, **Settings → Feeds**: make a Feed, and make a Feed Key for it with an end date within a year. Copy the key (shown once).
2. On each Metric the table should fill, open **Who submits** and add the Feed.
3. In n8n, import `excel-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address already in it (**Fill from n8n** on a Metric or after **Set up from a Pack**).
4. Open the **Settings** node and fill in your Ziffr address, the workbook's id (OneDrive or SharePoint item id), the name of the sheet and the name of the table.
5. Add the credential **Microsoft Excel OAuth2 API** in n8n and choose it in **Read the table**. n8n's credential needs an app registration in Microsoft Entra (a client id and secret); n8n's [Microsoft credentials guide](https://docs.n8n.io/integrations/builtin/credentials/microsoft/) says how. Ask for the least access you can: the template only reads, but the credential allows what you grant it, so grant read access to files if n8n lets you choose.
6. Add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **What is filled** and **Send to Ziffr**. Keep the key in the credential, never in the workflow, so that you can share the workflow.
7. Press **Execute workflow** once. In Ziffr the Metrics show the values, from "Feed". Then activate the workflow: it runs every day at 9 (UTC).

## What it does with a value

- **A past period that already has a value is not sent again.** The first node asks Ziffr which periods are filled, so rerunning the workflow never overwrites or doubles what is there. A past period with no value is an **Import**, recorded without the Unusual Value check. To correct a past value, change it in Ziffr.
- **A value for the current period** is checked as any value is: an Unusual Value waits for Approval. It is sent on every run, so under a Submission Rule that adds (`add`) or keeps both (`keep_both`) a row that stays in the table is counted again each day: keep only new rows there, or use a Metric that takes the latest value.
- **Running twice records nothing twice.** The same rows send the same key, so a retried run replays Ziffr's first answer.
- **A refused value fails the run**, so n8n shows it as failed and whoever watches it looks. The other values of the run were recorded all the same.

## Without n8n

Ziffr never reads your workbook itself, so something outside Ziffr has to send the numbers. n8n is only one runner; the whole contract is one HTTPS call, `POST /api/v1/feed/observations`, shown with working examples under **Workspace → Connectors → Send values**. Other ways to make that call from Microsoft 365, **not built or tried here**:

- **Paste** the cells into Ziffr (**Paste values** in the Metrics list, or **Paste history** on a Metric): no connection at all, by hand.
- **Power Automate** or an **Office Script** that reads the table and makes the call. A sender that does this itself must do what the template does for you: send only the figures, send the period's first day, send an `Idempotency-Key`, and read the Feed's list of filled periods (`GET /api/v1/feed`) so it does not resend them.

## Limits

- **Numbers only.** The template does not read formatted cells (`12 %`, `€ 1,200`): make a column that holds the plain number, with a formula if needed.
- **One table.** For several, import the workflow again for each.
- **Dates before 1 March 1900** (Excel's numbers 1 to 60) are not read as dates; the row is skipped with its number named.
- **Ziffr allows 10,000 values a day** per Feed unless the Installation set another limit, and one batch of at most 500 at a time.
- **The key can write values for its Feed's Metrics and nothing else.** It cannot read a value or see a person. Still, it is a secret: if it leaks, revoke it in Ziffr under **Settings → Feeds** and make another.
- **The workbook's editors decide what is sent.** Whoever can edit the table can change a Metric's value. Share it as you would share the numbers.
- **Microsoft can change.** If the Excel node of a newer n8n asks for other settings, import the workflow again from this repository or fix the node; a template that stops working is fixed by a pull request.
