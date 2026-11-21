# Automation Templates generator

`generate.mjs` writes every n8n workflow in `docs/automations/`. The code the workflows run lives in `code/` (shared steps and the Slack ones) and `helpers/` (what differs per task system: how a task is read, created and updated); the nodes every workflow starts from are in `base-nodes.json`. Node ids come from the workflow and node names, so regenerating changes only what you changed.

```
node scripts/automation-templates/generate.mjs          # write docs/automations/*.json
node scripts/automation-templates/generate.mjs --check  # fail when a file differs
```

`packages/core/src/automation-templates.test.ts` runs the same comparison, then runs the Code nodes against the Webhook fixtures. A new system: add its helpers and an entry in `generate.mjs`, a guide in `docs/automations/`, and a spec in the test.
