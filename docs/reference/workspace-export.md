# Workspace Export format

A **Workspace Export** is one file that holds a whole Workspace, so that another Installation can import it as a new Workspace. This page is the format, `ziffr.workspace-export/1`, for anyone who reads or writes one. The checks are in [`@ziffr/pack`](../../packages/pack/README.md) (MIT), beside the Pack format they reuse; the JSON Schema of one line is [`workspace-export.schema.json`](workspace-export.schema.json), generated from the definition the checks run and never edited by hand.

A Workspace Export is as private as the Workspace was: it holds every value in the clear. Ziffr never stores one; it is built while it downloads.

## The file

JSON Lines in UTF-8: one record per line, each a JSON object with a `kind`. The file may be gzipped (it then starts with the gzip mark; the usual name is `.jsonl.gz`). A line is at most 640 KiB and an object is nested at most 20 levels deep.

The first line is the **header**, the last is the **end** record, and in between the records come in this order: `group` and `theme`, then `person`, then `metric`, then `dashboard`, `deck` and `workflow`, then `share`, then `target`, `projection` and `value`. Within one step any order is fine; the file never goes back a step. A record may name only records read before it, so a reader checks every reference while it streams and holds only the labels of what it has read, never the values.

```text
{"kind":"header","format":"ziffr.workspace-export/1","ziffr":"0.40.0","exportedAt":"2026-11-22T10:00:00Z","workspace":{"name":"Acme"}}
{"kind":"group","id":"g1","name":"Sales team"}
{"kind":"person","id":"p1","name":"Ada Lovelace","email":"ada@example.com","role":"admin","groups":["g1"]}
{"kind":"metric","id":"m1","key":"orders","metric":{"format":"ziffr.metric/1","name":"Orders","period":"month","aggregation":"sum","polarity":"higher"},"owner":"p1"}
{"kind":"value","metric":"m1","period":"2026-01-01","value":14,"submittedBy":"Ada Lovelace","source":"web_form"}
{"kind":"end","counts":{"group":1,"theme":0,"person":1,"metric":1,"dashboard":0,"deck":0,"workflow":0,"share":0,"target":0,"projection":0,"value":1}}
```

## The records

Every `id` is a **label** of up to 64 letters, digits, dashes and underscores that stands for one record of this file only. An import replaces every label with a new id of its own, so a file cannot name a row of another Workspace. Documents inside a record are the formats of the [Pack](../guides/packs.md), checked by their own schemas.

| `kind` | What it holds | Names |
| --- | --- | --- |
| `header` | The format, the Ziffr release that wrote it, the moment, and the Workspace's `name`, `timeZone`, `language`, `yearStart` (the month the Workspace's year starts in) and `attainmentMethod`. | |
| `group` | A Group's name. | |
| `theme` | A Theme, as a `ziffr.theme/1` document. | |
| `person` | A person as an **invitation**: name, email address, Workspace Role (`admin`, `member` or `guest`) and Groups. The old Owner is an `admin`: whoever imports becomes the Owner. | `group` |
| `metric` | A Metric's `ziffr.metric/1` document, its `key` (how a Derived Metric's formula names it), Tags, owner and Submitters. | `person` |
| `dashboard` | A `ziffr.dashboard-template/1` document and the Metrics that fill its Slots. | `metric` |
| `deck` | A `ziffr.deck-template/1` document, the Metrics that fill its Slots and its Theme. | `metric`, `theme` |
| `workflow` | A `ziffr.workflow-template/1` document and the Metrics it asks for. | `metric` |
| `share` | A dashboard, deck or Metric shown to a Group or a person. | `dashboard`, `deck`, `metric`, `group`, `person` |
| `target` | The Target Range of one period of a Metric (a Target Series entry). | `metric` |
| `projection` | A value for a future period. | `metric` |
| `value` | One observation: period, number, when it was recorded, its Source, who submitted it **as a name**, and its Breakdown. | `metric` |
| `end` | How many records of each kind the file holds, so a file cut off is noticed. | |

A period is the first day of the period as `YYYY-MM-DD`: a Monday for a weekly Metric, and for a monthly, quarterly or yearly Metric the first day of one, quarters and years counted from `yearStart`. `target` records are listed by Metric label and then period, and so are `projection` records, each pair once. Numbers are finite, at most 10^30 in size and have at most eight decimals. Moments are in UTC (`...Z`). Years run from 1900 to 2200.

## What is never carried

Access Keys, Feed Keys, Webhook addresses and secrets, Connector links (Slack, Telegram), Contacts' details, anything sealed in the form it has in the database, the Workspace Key, the Audit Log, Delivery history and the Outbox. Every record is closed: a field the schema does not list is refused, and a field whose name says it is a key, secret, token, link to another system or sealed data is refused in words. Where a sealed value had to travel (a Webhook's secret) it does not: the import page lists the names so they can be made again.

Later versions may add Threads, Findings, Snapshots, Alerts, Retentions and Delivery Preferences; each addition is a new version number. A reader of version 1 refuses a record kind it does not know rather than skip it.

Names, descriptions, Tags, Groups, people and Breakdown labels hold whatever a person typed in Ziffr (markup and web addresses are data here, never rendered or followed as such): only control characters, line and paragraph separators and characters that reverse the direction of text are refused. A Metric's description may have 2,000 characters. The documents of dashboards, decks, Workflows and Themes keep the Pack's plain-text rules, so a writer that finds a word they refuse leaves it out and says so; it never truncates silently. A file's text may reach 1 GB and the file 200 MB (a reader may set other limits): Ziffr's writer gzips by default and refuses to write a file over the limits, so what it writes is always read.

## Checks on an untrusted file

A reader checks, in this order and while it reads:

- the size of the file and of its unzipped text, against limits it sets (Ziffr's defaults are 200 MB and 1 GB), while reading, so a zip bomb stops at the limit;
- the length of each line, nesting depth, and the number of records (at most 10,000,000 lines, and per kind: 1,000 Groups, 200 Themes, 5,000 people, 10,000 Metrics, 2,000 dashboards, 2,000 decks, 1,000 Workflows, 100,000 Shares, 1,000,000 targets, 1,000,000 projections, 8,000,000 values);
- that each line is JSON with no repeated field, and that `__proto__` and its like are data, never a prototype;
- the record against its schema: types, lengths, patterns, finite numbers within range, real dates and moments;
- text by the Pack's plain-text rules: no markup, templates, web addresses or control characters;
- references: each names a record already read; labels, Metric keys, email addresses and Groups of one person are unique; a Slot is filled by as many Metrics as it takes; a Derived Metric's formula names only Metrics of the file;
- the documents inside against their own formats, with no Pack item named (a file is not a Pack);
- that the file has its end record and the counts in it are true.

A problem names its line, the field and the reason, as the Pack checker does:

```text
export.jsonl:3: email must be an email address, such as “ada@example.com”.
```

No query is built from a string of the file. Checking creates nothing: a program that writes as it reads (an import) must be ready to throw its work away at the first problem.

## Reading and writing

In a program, `import { checkWorkspaceExport, WorkspaceExportChecker } from "@ziffr/pack/workspace-export"`: `WorkspaceExportChecker.line(text)` checks one line at a time and `finish()` the whole, and `checkWorkspaceExport(text)` does both for a small file. Ziffr's own reader and writer, `readWorkspaceExport` and `writeWorkspaceExport` in the core, add the byte level (gzip, size limits, line splitting) on top and have no database.
