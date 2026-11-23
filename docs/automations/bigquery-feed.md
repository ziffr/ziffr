# BigQuery to Ziffr (Automation Template for a Feed)

One n8n workflow that runs a query you write in BigQuery once a month and sends the rows it returns to Ziffr as the values of your Metrics. It is an [Automation Template](../../GLOSSARY.md): a file in this repository that you import into your own n8n. Ziffr never runs it, never reads your warehouse and never holds your Google login; the Feed Key it sends with lives in an n8n credential. It sends through a [Feed](../guides/feeds.md), the same way as the [Google Sheets](google-sheets-feed.md) template, on the same shared steps and checks. For a runner that is not n8n, see spec 0048's SQL Feed.

**Tried against a real n8n and BigQuery:** not yet — owner to try. The node's settings were checked with the n8n tooling.

| File | Direction | What it does |
|---|---|---|
| [`bigquery-feed.json`](bigquery-feed.json) | BigQuery to Ziffr | On the 1st of every month at 9 (UTC): asks Ziffr which months are filled, runs your query, checks each row, sends the good ones to the Feed endpoint, and fails the run if Ziffr refuses a value. |

## The query

The node **Your query** holds an example. Replace it with yours. It must return one row for each figure, with these columns (capitals do not matter, other columns are ignored and never leave n8n):

| Column | What it holds |
|---|---|
| `metric` | The Metric's slug, as Ziffr shows it in the Metric's address: lower case letters, digits and hyphens. |
| `value` | A plain number. Cast it (`CAST(... AS NUMERIC)`) so BigQuery does not answer in scientific notation. |
| `period` | The first day of the period the value is for, a `DATE`. |

One query serves several Metrics: put a `SELECT` for each and join them with `UNION ALL`, as the example does. The example uses the month that has just ended; the dates are written as n8n expressions (`{{ $now.minus({ months: 1 }).startOf('month').toFormat('yyyy-MM-dd') }}` for the month's first day and `{{ $now.startOf('month').toFormat('yyyy-MM-dd') }}` for the next month's), in UTC, so you write no dates yourself. Use them wherever your query needs the period's start and end. Only the expressions in the file are put into the query; nothing from your data or from Ziffr is.

A row Ziffr would refuse (a name that is not a slug, a value that is not a number, a period that is not a day, the same Metric and period twice) is skipped, and the run's output says which row and why. At most 500 rows are sent in one run. A query that returns nothing fails the run in words.

## Set up

1. In Google Cloud, make a **service account** that has the roles **BigQuery Job User** (to run queries) and **BigQuery Data Viewer** on the datasets the query reads, and no others. Make a key for it, or use n8n's Google login.
2. In Ziffr, **Settings → Feeds**: make a Feed, and make a Feed Key for it with an end date within a year. Copy the key (shown once).
3. Make the Metrics (monthly), and on each open **Who submits** and add the Feed.
4. In n8n, import `bigquery-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address already in it (**Fill from n8n** on a Metric or after **Set up from a Pack**).
5. Open **Settings**: your Ziffr address. Open **Your query**: choose the project and write your query.
6. Add the credential **Google BigQuery** in n8n and choose it in **Your query**.
7. Add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **What is filled** and **Send to Ziffr**. Keep the key in the credential, never in the workflow, so that you can share the workflow.
8. Press **Execute workflow** once. In Ziffr the Metrics show the values, from "Feed". Then activate the workflow.

## What it does with a value

- **A past period that already has a value is not sent again.** The first node asks Ziffr which periods are filled, so rerunning never overwrites or doubles what is there. A past period with no value is an **Import**. To correct a past value, change it in Ziffr.
- **A value for the current period** is checked as any value is: an Unusual Value waits for Approval.
- **Running twice records nothing twice.** The same rows send the same key.
- **A refused value fails the run**, so n8n shows it as failed. The other values of the run were recorded all the same.

## Limits

- **Cost is yours.** The query runs as written, once a month, on your project: BigQuery bills it. Select only the columns and partitions you need. The template cannot make a query read-only: grant the service account read roles only.
- **One query node.** For another schedule or source, import the workflow again.
- **Ziffr allows 10,000 values a day** per Feed unless the Installation set another limit, and one batch of at most 500 at a time.
- **The key can write values for its Feed's Metrics and nothing else.** If it leaks, revoke it in Ziffr under **Settings → Feeds** and make another.
- **n8n can change.** If the BigQuery node of a newer n8n asks for other settings, import the workflow again from this repository or fix the node.
