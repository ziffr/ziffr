---
"@ziffr/web": patch
---

The n8n templates that fill Metrics through a Feed (Google Sheets, Excel, Stripe, HubSpot, BigQuery, Snowflake) failed at their first call, because they asked for more Metrics in one page than Ziffr hands out. Download or import them again; one Feed can fill up to 100 Metrics with them.
