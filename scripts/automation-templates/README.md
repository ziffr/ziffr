# Automation Templates generator

`generate.mjs` writes every n8n workflow in `docs/automations/`. The code the workflows run lives in `code/` (shared steps and the Slack ones) and `helpers/` (what differs per task system: how a task is read, created and updated); the nodes every workflow starts from are in `base-nodes.json`. Node ids come from the workflow and node names, so regenerating changes only what you changed.

```
node scripts/automation-templates/generate.mjs          # write docs/automations/*.json
node scripts/automation-templates/generate.mjs --check  # fail when a file differs
```

`packages/core/src/automation-templates.test.ts` runs the same comparison, then runs the Code nodes against the Webhook fixtures. A new system: add its helpers and an entry in `generate.mjs`, a guide in `docs/automations/`, and a spec in the test.

## Adding a Feed template (`*-feed.json`, spec 0043)

A Feed template is a source plus a part that is the same for every source, so that what goes wrong the same way for any source is fixed once. You write only the source:

1. **The read nodes** (`generate.mjs`, a function passed to `feedFlow`): the nodes that read the other system, read only, with its login in an n8n credential.
2. **One Code node, `Figures`** (`code/<source>-figures.js`): turns what was read into plain rows `{ metric, value, period?, row? }` and nothing else. Use `@@SETTINGS@@` (`code/feed-settings.js`) for the Metric slugs in the Settings node and for "the month that has just ended" (UTC), and `none` for the message when there is nothing to send.
3. **A guide** (`docs/automations/<source>-feed.md`), an entry in `FEED_TEMPLATES`, the id in `FEED_TEMPLATE_IDS` (`packages/pack/src/pack.ts`) and the workflow in `feed-template-download.ts`.

Everything else comes from `feedFlow` and is not yours to write: the schedule and its time zone (UTC), the node `What is filled` (asks Ziffr which periods already hold a value), `Shape values` (`code/feed-finish.js`: checks every row, leaves out a past period that is filled, makes the key), `Send to Ziffr` and `Check the answers`.

`automation-templates.test.ts` runs one contract over every template in `feed-templates.json`, with one fixture each (`SOURCES`): the test fails until you add yours, and then checks that your template sends only what Ziffr accepts, never resends a filled past period, keeps one key for the same figures, has the shared node word for word, and reaches Ziffr only through its two nodes. Tests for what is particular to your source (a currency's units, a cancellation's date) go next to the Stripe and HubSpot ones.
