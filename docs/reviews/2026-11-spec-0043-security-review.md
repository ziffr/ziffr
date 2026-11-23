# Security review: Automation Templates for Feeds (spec 0043)

Independent review of the whole spec (the download, the Pack `feeds` field, the assistant text, the generated n8n flows for Google Sheets, Stripe and HubSpot) on 2026-11-23, by a reviewer who had not written it. The threat model is item 25 of [threat-model.md](../security/threat-model.md).

**Result.** No way for anyone but an Owner or Admin to get a file or a key, no way for text from a browser, a Pack or a Metric to change a generated file's structure or leak a Feed Key, and no write to Stripe or HubSpot. The findings were figures that could be wrong without an error, and some guide sentences that were untrue.

| # | Finding | Severity | Resolved |
|---|---|---|---|
| M1 | Every run re-sent every row; under the `add` and `keep_both` Submission Rules a figure counted again each run, under `overwrite` a later run replaced last month's value, and the guides said a rerun changes nothing. | Medium | The flows ask Ziffr which periods are filled (`What is filled`) and do not send a past period that has a value; the key no longer holds the date; guides corrected; the remaining current-period case under `add` and `keep_both` is stated in the Google Sheets guide. |
| M2 | Stripe churn missed a subscription cancelled "at the end of the period" (its `canceled_at` is the day it was asked for). | Medium | Counted by `ended_at`, with a test. |
| M3 | An n8n server east of UTC+9:30 labelled the wrong month. | Medium | The flows run in UTC (workflow setting), said in the guides. |
| M4 | The guides said an unusual value waits for Approval; last month is an Import and skips that check. | Medium | Guides corrected. |
| L1 | A Feed Key made for an existing Feed works for all its Metrics, not only the ones named. | Low | Said on the page and in the threat model; spec wording corrected. |
| L2 | A Stripe subscription with more than 10 items was undercounted. | Low | The run fails and sends nothing. |
| L3 | Stripe lists every cancellation ever made, not only last month's. | Low | Accepted and written in the guide; the run fails honestly past 5,000. Reading Stripe's events instead (needs a wider key) can follow if someone needs it. |
| L4 | With `ZIFFR_SITE_URL` unset the file pointed to `localhost` over http. | Low | The app refuses in production; the core refuses plain http to anything but this computer. |
| L5 | A Metric with a very long name has a slug the templates refuse. | Low | Checked in the download, which refuses it with a message. |
| L6 | Three-decimal currencies listed too widely (IQD and LYD). | Low | Only BHD, JOD, KWD, OMR and TND. |
| L7 | HubSpot's search returns one whole record into n8n's run history. | Low | Asks for the id only. |
| L8 | A failure part-way through a download leaves a Feed and some links. | Low | Accepted (tidiness, not security); in the threat model. |

**Checked and found sound:** who may download and which Workspace is touched; the one value set in the file and where it comes from; the Feed Key in no file, log or audit event; the Pack `feeds` checks; the quoting of the assistant text; Stripe and HubSpot read only; the interval and currency arithmetic apart from L6.
