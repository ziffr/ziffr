# Hosted Ziffr is priced per Workspace by its Size; billing lives outside the open code; the Marketplace holds no code

Ziffr earns money from hosting it, not from features held back. **Hosted Ziffr charges a flat price per Workspace by its Size, and the Size grows only with the number of Metrics.** Members are unlimited and every feature is included at every Size; Guests, Contacts, Feeds and assistants never cost anything. Values per day and storage are only safeguards against abuse, never a price lever. **`ee/` stays empty for now:** money comes from hosting, from the Marketplace and from the managed-service license for IT providers (on request, ADR 0009). **Billing lives in a separate private service, Ziffr Cloud, in its own repository.** The open code knows only generic Workspace Limits (the number of Metrics), unlimited by default, set by an Installation Admin or by Ziffr Cloud, so self-hosters get no limits. **The Marketplace offers only Packs without code** (Analysis Recipes, View Designs, Dashboard and Deck Templates, Metric Catalog entries, Workflow Templates and Themes); code from anyone else never runs inside Ziffr. **Programs that run outside Ziffr, such as Feeds, are only listed** as "works with Ziffr": their creators bill their customers themselves, and Ziffr takes no share. The owner decided this on 2026-11-19; spec 0029 (plans and limits) and spec 0030 (Packs and the Marketplace) have the details.

## Considered Options

### What the price is counted by

- **Per person (a seat price, as most team tools charge):** rejected. Ziffr's point is asking many people for numbers and showing the numbers to many more. A price per person makes every Owner ask "is this person worth a seat?" before inviting them, which works against that. It also needs rules for who counts (Guests, Contacts, Feeds, assistants, people who left mid-month), each of which invites gaming.
- **Per Metric, metered (a price for each Metric each month):** fair, but the invoice changes every month, and a team cannot tell what it will pay. Sizes are steps of Metric counts instead: the number that tracks the value a Workspace gets, at a price that stays the same until someone changes the Size.
- **By values per day or storage:** rejected as a price. A Feed that sends every hour would cost more than one that sends daily for the same Metrics, which punishes automation. Both stay limits against abuse, the same at every Size.
- **Features by Size (Slack only from Team, Snapshots only from Business):** rejected. It splits the user guide, the tests and the support answers by Size, and it hides from small teams exactly the features that show Ziffr best.

### Where paid features would live

- **Paid features in `ee/`** (ADR 0002 keeps the folder for them): not now. Every feature in `ee/` is one self-hosters cannot use without a license, and the price of a Workspace already covers every feature. The folder stays, empty, so the choice can be revisited (by a new ADR) when a feature is worth selling on its own, such as bring your own key (ADR 0012).

### Where billing lives

- **Billing in the open code** (Sizes, prices, Stripe calls, invoices in `packages/core`): rejected. Self-hosters would carry code and settings they never use. Every price change would become a release of Ziffr, and the hosted offering's business details would sit in a public repository.
- **Billing in `ee/`:** rejected for the same reasons, and because self-hosters should not need a license to run a Ziffr without limits.
- **A separate private service, Ziffr Cloud** (chosen): it sells Sizes, takes payments and sets each Workspace's limit through a narrow API with its own credential. The open code gains only what any operator could want: a limit on Metrics per Workspace, and the generic rules around it.

### Who takes the payments

- **Paddle or Lemon Squeezy as merchant of record:** they sell in their own name and handle VAT everywhere, which saves registering for VAT. Rejected for now: their fees are several times Stripe's, the customer's invoice comes from them and not from Ziffr, and paying Pack creators later needs a payout platform anyway. Ziffr sells in EUR from the EU, so EU VAT through the One-Stop Shop is manageable.
- **Stripe Billing with Stripe Tax** (chosen), EU VAT through OSS; creators are paid later through Stripe Connect. If selling outside the EU grows to need registrations in many countries, a merchant of record is the option to look at again.

### What the Marketplace may hold

- **Code plugins, as in WordPress or Grafana:** rejected. A plugin runs with the rights of whoever uses it, in the browser or on the server. It could read every number it can reach and send it anywhere, and no review can reliably tell harmless code from harmful code (spec 0024). A number such code computes has not been verified the way spec 0022 requires. WordPress and Grafana show what follows: a review queue that cannot keep up, plugins as the most common way in, and sites that break on upgrade.
- **Code plugins in a sandbox** (spec 0024's later step: a frame on its own origin with no network): rejected for the Marketplace. A sandbox reduces what code can reach, but it is one more boundary to keep watertight in every browser for every release, and its results would still be unverified numbers. Spec 0024's note on code plugins is superseded by this ADR.
- **Packs without code** (chosen): everything in a Pack is data in a format Ziffr already checks and draws or runs with its own code (spec 0024's View Designs and Analysis Recipes, and the template formats). What a Pack can do is limited to what a person could build by hand.

### What happens with programs that run outside Ziffr

- **Selling them through the Marketplace with a share for Ziffr:** rejected. Ziffr would then answer for software it does not run, and the "works with Ziffr" check (below) would be read as a guarantee.
- **Listing them only** (chosen), after a short check: the program uses only a Feed Key and states what it reads. That is the boundary ADR 0006 drew for Feeds: Ziffr never runs their code or holds their credentials.

## Consequences

- **The open code stays free of prices.** It holds a limit per Workspace with a name to show (the Size's, such as "Small"), and the Installation's default limit. Without a limit Ziffr behaves as it does today. Ziffr Cloud sets limits through a signed API it alone holds the key to (spec 0029).
- **Ziffr Cloud never sees a Workspace's data.** It learns how many Metrics a Workspace has, its limit and whether it is in its trial, and the Owner's address when they book. It never sees a Metric's name, a value or a member list. Payment details stay with Ziffr Cloud and Stripe; Admins see the Size and usage, never the payment details.
- **Running over the limit never stops a Workspace.** Existing Metrics, values, Prompts and dashboards keep working, and collecting values never stops; only new Metrics wait (spec 0029). A limit is a reason to change Size, never a way to hold a team's numbers hostage.
- **A Pack can never do more than a person could do by hand.** Installing it copies data into a Workspace, checked by the same checks as a file brought in by hand (spec 0024). The Marketplace's checks before listing are an extra layer, not the protection.
- **The Marketplace's own code is closed**, as part of Ziffr Cloud. The Pack format, the checks and installing are open, and the format is MIT (ADR 0002's rule for what others build on), so anyone can make and check a Pack without Ziffr.
- **Listing a program outside Ziffr is not an endorsement.** Its page says what Ziffr checked (it asks for a Feed Key and says what it reads) and what it did not (its code, its uptime, how it handles the other system's credentials).
- **Changing any of this is a new ADR:** prices per person, paid features in `ee/`, billing in the open code, or code from others running inside Ziffr.
