# Ziffr's starting Packs

Seven Packs made by Ziffr, under CC BY 4.0, so a new Workspace starts from a good setup instead of an empty page. Each is one file; install it on **Workspace → Packs** with **Choose a Pack file…** (an Owner, for the board meeting deck, since it holds a Theme). Installing adds Metric Catalog entries, templates, designs and Themes, and makes no Metric until you use them.

| File | What it holds |
| --- | --- |
| [`saas-metrics.pack.json`](saas-metrics.pack.json) | MRR and its new, expansion and churned parts, customers, churn, net revenue retention, CAC and revenue per account (a Derived Metric); a monthly dashboard; a smoothed-growth Analysis Recipe and the View Design that draws it; a Workflow Template for the monthly close. |
| [`online-shop.pack.json`](online-shop.pack.json) | Orders, online revenue (with a Breakdown by channel), average order value (a Derived Metric), conversion rate, return rate and sessions; a weekly dashboard; a Workflow Template that asks for the week's numbers on Monday. |
| [`agency.pack.json`](agency.pack.json) | Billable hours, utilisation, revenue, effective hourly rate, open invoices and pipeline; a monthly dashboard; a Workflow Template that asks for hours on Fridays. |
| [`sports-club.pack.json`](sports-club.pack.json) | Members, joiners and leavers, attendance per training, fees received and volunteer hours; a season dashboard; a Workflow Template that asks each coach for attendance after training. |
| [`board-meeting.pack.json`](board-meeting.pack.json) | A Deck Template for a quarterly board meeting (key figures, revenue against its target, cash and runway, headcount, highlights and risks), a Theme for it, the Metric Catalog entries it suggests, and a Workflow Template for the quarter's close. |
| [`workspace-usage.pack.json`](workspace-usage.pack.json) | Your own Workspace's usage as Metrics by day: views of dashboards, decks and Metrics, values by Source, and how many Metrics, dashboards and Submitters go unused; a "Workspace usage" dashboard. Counts only; held back in a Workspace of fewer than three people. Fed by the [Usage Feed](../docs/guides/usage.md) with `--workspace`; 18 Metrics, so mind the Workspace Limit. |
| [`ziffr-operations.pack.json`](ziffr-operations.pack.json) | One Metric by day for every figure of the [Usage Feed](../docs/guides/usage.md) (people, Workspaces, signups, trials, values by Source, calls, views), and a "Ziffr operations" dashboard. Set it up with the Feed as Submitter. |

Where a Metric of the Metric Catalog fits, an entry uses its name and description, so the catalog and the Packs say the same thing. Tests check every file with the checks Ziffr runs on any Pack (`starting-packs.test.ts`) and install all seven into one Workspace (`starting-packs.db.test.ts`). Check a changed file yourself with `npx @ziffr/pack check packs/<file>`, and raise its version.
