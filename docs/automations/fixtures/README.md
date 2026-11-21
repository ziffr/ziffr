# Webhook fixtures

One example message for each event a Webhook is sent, and a signing example, for people who build the receiving side and for the tests of the [Automation Templates](../../specs/0034-webhooks-and-automation-templates.md). The [Webhooks guide](../../guides/webhooks.md) explains them.

They are **made by the core's own message builders** and checked against [`webhook-events.schema.json`](../../reference/webhook-events.schema.json) by `packages/core/src/webhook-fixtures.test.ts`, so a change to a message fails that test until the fixtures follow. Never edit them by hand: after a change to the builders, run `UPDATE_REFERENCE=1 pnpm --filter @ziffr/core exec vitest run src/webhook-fixtures.test.ts` and commit the result.

`signing-example.json` holds a made-up secret, a timestamp, the body of `action-created.json` and the headers Ziffr sends for them. The code in the guide is run against it.
