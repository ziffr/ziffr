# Trials exist only on hosted Ziffr, and are open to a team

A **Trial Workspace** is offered only by hosted Ziffr (ziffr.net), where Ziffr Cloud is set up, and never by an Installation someone else runs. **A trial may have a team:** its Owner invites colleagues, within **Trial Limits**, and every Connector reaches those who accepted. A trial reaches people who proved their address by accepting, plus one invitation email to an address nobody has proved, under limits for each trial and for all trials together; Contacts stay simulated. At its end a trial is subscribed to (a Size, everything kept) or closed, and its Owner takes a **Workspace Export** to run it on their own Ziffr. The limits are numbers in one place, not features switched per Size. This supersedes ADR 0010 and the parts of spec 0021 and spec 0029 that keep a trial to one person, and it changes where a trial may exist. The owner decided this on 2026-11-22; spec 0040 has the details.

## Considered Options

- **Keep ADR 0010 (a trial reaches only its Owner):** rejected. It protected a public sign-up run by any operator, and it kept a team from trying what a team buys Ziffr for. The owner wants a trial to show as much as possible, colleagues included.
- **Trials for teams on every Installation, with the operator's own limits:** rejected. Any operator who switches trials on opens a public sign-up that can mail strangers from their own domain, which was ADR 0010's concern, and Ziffr cannot watch or fix it. A trial is a way to decide whether to pay for hosted Ziffr or to run it, so it belongs where that choice is made.
- **Consent per address (a first email asks the colleague whether they want Prompts):** rejected again for the reason ADR 0010 gave: that first email is itself a message to a typed address. The invitation is that one email, so it is limited and can be stopped.
- **Invitations only to the Owner's own email domain:** a possible tightening if abuse appears, not the start. It would keep a consultant from inviting a client.
- **Locking trials to hosted Ziffr in the code (a licence check, obfuscation, a call home):** rejected. The code is open and an operator can change it. The check is a plain condition on `ZIFFR_CLOUD_KEY`: the product offers trials only where Ziffr Cloud is, and anyone who edits that runs a different Ziffr on their own responsibility.
- **Feature switches per Size, or an entitlement system:** rejected by ADR 0013, and not needed. What a trial may do differs from an ordinary Workspace in numbers only, which are Trial Limits, set by Ziffr Cloud or the hosted Installation Admin without a release.
- **The Free Size after a trial (spec 0029):** rejected, and the Free Size goes altogether (the owner, 2026-11-22). A trial that is not subscribed to closes and is deleted, so there are two ways on: subscribe, or run Ziffr yourself. Whoever wants Ziffr for free runs it themselves.

## Consequences

- **A self-hoster has no trial to switch on.** The trial settings, the settings page's Trials section and the sign-in page's trial column go. An Installation that had `ZIFFR_TRIAL_DAYS` set stops making new Workspaces rather than opening ordinary ones to strangers, and its running trials finish. The shared demo stays.
- **A trial can invite, and invitation email is the one message to an unproved address.** That email is limited per trial, per address and for all trials together, comes with a one-click stop, and is held in the Outbox over a limit. Ziffr answers for the sender reputation of ziffr.net and can set a Trial Limit to 0 the same day.
- **Contacts stay simulated in a trial**, and the demo stays read-only. ADR 0010's rule that Deliveries to anyone but the Owner stay in the Outbox now reads: to anyone who has not accepted, and to every Contact.
- **"Run it yourself" needs a way out.** A Workspace export and import exist as spec 0040's tickets. They carry no secret, key or Connector link, and an import re-seals everything under the new Installation's keys.
- **There is no Free Size.** The Sizes are Small, Team and Business, larger on request. A cancelled Size closes its Workspace as an ended trial is closed, with a Workspace Export first. ADR 0013 names no Free Size and stands.
- **ADR 0013 holds:** every Size has every feature. Ziffr Cloud learns more, the Trial Limits it set and nothing of a Workspace's data.
- **Changing any of this is a new ADR:** trials outside hosted Ziffr, a trial that reaches Contacts or unproved addresses beyond the invitation, or features held back by Size.
