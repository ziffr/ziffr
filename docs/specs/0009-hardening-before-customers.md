# 0009 Hardening before customers

**Status:** done. **Tracking issue:** #128 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0009`.

## Problem Statement

The threat model (`docs/security/threat-model.md`) lists open work that matters once real teams keep their numbers in Ziffr. Sign-in links are limited only by Supabase's settings, which a self-hoster may leave wide open. A signed-in person can be switched into the shared demo by a link, and the guard relies on a header some browsers do not send. Deck images, bookmarks and embeds can point at other sites, so showing a deck (also through a View Link) tells those sites someone looked. The key that seals Connector secrets cannot be changed without every workspace connecting Slack again. The Audit Log can be exported without limit. And CI runs third-party actions by version tag, which their owners can move.

## Solution

Six changes, each small, none changing what people see in normal use:

1. **Sign-in limits of Ziffr's own:** at most 5 sign-in links an hour per address from one network address, 30 per address from anywhere and 20 per network address, counted in the database from hashes.
2. **An explicit step into the demo** for anyone signed in: a confirm page, then a same-site POST.
3. **Only uploaded images in decks:** links, bookmarks, embeds and images from other sites are refused when a deck is saved, turned off in the editor, and left out when a deck is shown.
4. **Rotating `ZIFFR_SECRETS_KEY`:** the previous key still opens what it sealed, and each secret is sealed again under the new key the next time it is used.
5. **A limit on Audit Log exports:** 10 per workspace per hour.
6. **Actions pinned by commit** in every workflow.

## User Stories

1. As a self-hoster, I want Ziffr to limit sign-in links itself, so a mistake in Supabase's settings does not let someone flood an inbox or our mail quota.
2. As a person signing in, I want the same answer whether or not my address has an account, also when I am limited.
3. As a signed-in member, I want a link on another site never to drop me into the demo, where I might type real numbers.
4. As a demo visitor without an account, I want to enter the demo with one click, as before.
5. As a deck owner, I want to know when something on a slide would load from another site, and paste the image itself instead.
6. As a customer viewing a deck through a View Link, I want nothing in it to tell other sites that I looked.
7. As a self-hoster, I want to change the key that seals Connector secrets without every workspace connecting Slack again.
8. As an Owner, I want exports of the Audit Log limited, so a stolen session cannot pull it again and again unnoticed.
9. As a maintainer, I want CI to run exactly the action code we reviewed, not whatever a moved tag points to.

## Implementation Decisions

- **Sign-in limits.** `sendSignInLink` asks the core (`claimSignInLink`) before Supabase. The database function `claim_sign_in_link` takes a lock per key, counts the last hour's requests for the address and network address together (5), for the address alone (30) and for the network address alone (20), and records the request only when all are under their limits, in one statement. The low limit is per place, so someone elsewhere cannot use up a person's links; the address alone has a ceiling high enough that locking someone out takes many places. The address is counted as the inbox it reaches: lowercased, without a `+tag`, and for Gmail without dots. Only SHA-256 hashes are stored, and rows older than a day are removed on the way. The network address is read only when `ZIFFR_PROXY_HOPS` says how many proxies in front of Ziffr add to `X-Forwarded-For`: the entry that many from the right, which the self-hoster's own proxy wrote (entries further left are whatever the client sent). An IPv6 address counts by its /64. Without that setting the network address is unknown, and only the per-address ceiling (30) holds: a low limit per address alone would let anyone lock a person out. A limited request gets the message a Supabase limit already gave ("Too many links asked for. Wait a minute and try again."), whether or not the address has an account. Provider sign-in (Google, Microsoft) is limited by the provider.
- **The demo step.** `GET /demo` still starts a visit for someone not signed in. Someone signed in is sent to `/demo/confirm`, which says what the demo is and has one button. The button posts to `/demo`, and the middleware refuses every POST there whose `Origin` is not the app's own (its address, or `ZIFFR_SITE_URL`'s), signed in or not: a browser leaves the session cookie off a post from another site, so checking only signed-in posts would let such a post through. Every browser sends `Origin` on a form post, so a link or form on another site can no longer switch anyone; `Sec-Fetch-Site` is no longer what the guard rests on.
- **Deck content from other sites.** A pure rule (`deckOutsideContent` in `deck-content.ts`) names what in a deck document would load from or link to another site: image and video assets whose source is not an uploaded `data:` image, bookmark assets, and bookmark, embed and linked image shapes. A widget on a slide or in a free layout can itself be a free layout with a document of its own (its settings, a JSON string on slides): it is read the same way, a few levels deep. `saveDeck` refuses a document with any of them, saying what to do. The editor turns pasted links into nothing and says so; pasted and dropped image files keep working (they are stored in the deck). `stripOutsideContent` removes such records when a deck is presented or shown through a View Link, so decks saved before this change load nothing from elsewhere either. Theme logos and slide backgrounds already accept only uploaded images.
- **Key rotation.** `ZIFFR_SECRETS_KEY_PREVIOUS` holds the key being retired. `openSecret` tries the current key, then the previous one, and says which opened it. When the previous key did, `slackBot` seals the token again under the current key and stores it. After every connected workspace has sent or received one Slack message, the previous key can be removed; the guide says how to check.
- **Audit Log export limit.** `exportAuditLog` counts the workspace's `export.audit_log` events of the last hour, which it records anyway, and refuses the eleventh with a clear message. No new table.
- **Pinned actions.** Every `uses:` names a full commit SHA with the version in a comment, so a moved tag changes nothing. Updating an action means changing the SHA in a reviewed pull request.

## Testing Decisions

- Database tests: the sign-in claim (limits per address and per network address, hashes only, old rows removed, two claims at once counted once each); `saveDeck` refusing outside content and accepting uploaded images; presenting and View Links leaving it out; the Audit Log's eleventh export refused; a token sealed under the previous key opened and sealed again.
- Unit tests: `deckOutsideContent` and `stripOutsideContent` on tldraw documents; `openSecret` with current and previous keys.
- The web: `/demo` signed in leads to the confirm page; a POST from another origin is refused; tried in the browser.

## Out of Scope

- Real WhatsApp and ticket-system Connectors: each needs its own spec and threat review, as email (0004) and Slack (0007) had.
- The lawyer's review of the licence texts.
- Sign-in limits for providers other than email links.
