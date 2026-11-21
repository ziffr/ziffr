<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/installation/** -->
# Installation settings

This chapter is for the people who run a Ziffr for others: a team, a club or a company. If someone else runs your Ziffr, you never see this page, and you can skip it.

An **Installation** is one running Ziffr, with all its Workspaces. Its **Installation Settings** say what it talks to: the mail server, Telegram and Slack, and later the check against bots and trials. The people who may change them are its **Installation Admins**. Being an Owner of a Workspace does not make you one, and being one shows you nothing of anyone's Workspace.

## Becoming the first Installation Admin

A new Ziffr has no Installation Admin. Until it has one, it writes a **setup code** to its server log each time it starts, such as `K7Q2-M9XD-4HRT-BW3N`.

1. Sign in to Ziffr.
2. Open `/installation`, for example `https://ziffr.example.com/installation`.
3. Copy the setup code from the server log. With Docker, `docker compose logs app` shows it. If it has left the log, opening the page writes a new one.
4. Enter it and choose **Claim**.

The code works once. After it, nobody can claim the Installation again, and the page answers "not found" to everyone who is not an Installation Admin. A wrong code is refused; after five wrong codes in an hour, you wait an hour.

Whoever runs the server can also name Installation Admins in its settings, by email address (`ZIFFR_INSTALLATION_ADMINS`). Then no setup code is needed, and those people are listed as "Named on the server".

Once you are an Installation Admin, your menu in the top bar has **Installation settings**. Below its heading, the page says which release this Ziffr is, such as "This is Ziffr 0.12.0.", when the server runs an image made by a release or for `main`: the release notes after it are the ones that concern you.

## Other Installation Admins

Under **Installation Admins**, add someone by the email address they signed in with. They must have signed in to this Ziffr once before. **Remove** takes someone off the list, yourself included, but the last one stays: add another one first. People named on the server stay until the server's settings change.

## Mail

Ziffr sends requests for values, reminders, replies and invitations by email once it has a mail server.

- **Mail server**: the address of your SMTP server with its user and password, such as `smtps://user:password@smtp.example.com:465`.
- **Sender**: the address emails come from, with a name if you like, such as `Ziffr <ziffr@example.com>`. Your mail server must be allowed to send as it.

Choose **Save**: it works at once, without restarting Ziffr. Then choose **Send a test email to yourself**. It goes to the address you signed in with, at most ten times an hour. If it fails, the page says one of: could not reach the mail server, the mail server refused the login, it refused the sender or recipient, or it did not work. "Working" next to the section's title means Ziffr has what it needs to send.

A mail server inside the server's own network, such as `localhost` or `10.0.0.5`, is refused unless whoever runs the server allows it. Options after a `?` are refused too.

The mail server is a secret. Once saved, the page never shows it again, only that it is saved and its last four characters. To change it, type a new one; to keep it, leave the field empty.

Sign-in links go out through this mail server too, where the sign-in service hands them to Ziffr, as a Ziffr run with Docker does by itself. Otherwise the sign-in service keeps the mail server from the server's settings for them.

## Replies by email

People can answer a request for a value, a question or a task by replying to its email, once mail works and replies are set up. Replies go to a domain of their own, such as `in.ziffr.example.com`; your inbound mail provider takes them and forwards each one to Ziffr, signed.

- **Domain for replies**: the domain replies go to.
- **Signing secret**: signs what the provider forwards. Choose **Make a signing secret**: the page shows a new one once, with **Copy**, for your provider's forwarder. It never shows it again; **Make a new signing secret** replaces it, and the old one stops working at once.
- **Provider that vouches for senders**: the name your provider writes in its Authentication-Results header. With it, only replies the provider vouched for are taken. Without it, the section says that replies are checked by their address alone and Approvals are never taken by email.

Under **Setting it up**, the page names the MX record the domain needs, and the MX records it has now, or that it has none yet. It also names the address the provider forwards to, which ends in `/api/inbound/email`. The [email guide](../guides/email.md#taking-replies) has a forwarder for Cloudflare.

**Test replies by email** sends you an email whose reply address is the test's own. Reply to it with anything. While the page waits it says "Sent. Reply to the test email"; when your reply arrives through the provider it says, for example, "Tested just now: Your reply arrived, signed, from your address. Your provider vouched for the sender." It also says when a reply came from another address, or when the provider did not vouch for it, since a real reply like that would be refused. The reply address works once, for thirty minutes, and reaches no Workspace. You can run the test five times an hour.

## Telegram

Ziffr asks for values and takes the answers by Telegram once it has a bot. One bot serves the whole Installation; each Workspace then turns Telegram on for itself on its Connectors page.

1. In Telegram, open **@BotFather**, send `/newbot`, and give the bot a name and a username ending in `bot`.
2. Copy the **token** BotFather sends, such as `7000000001:AAF…`. Whoever has it can send and read as the bot, so keep it to yourself.
3. Paste it under **Bot token** and choose **Save**.

Ziffr asks Telegram about the token first and saves nothing Telegram refuses. Then it tells Telegram where to send answers, and the page names the bot: "Saved: @acme_ziffr_bot". "Working" next to the title and "Bot @acme_ziffr_bot" below it mean Workspaces can turn Telegram on.

If Telegram could not be told where to send answers, the token is saved anyway and the page says why. This Ziffr's address must start with `https://`, or the server must fetch answers itself (polling, for a laptop). As long as Telegram does not send answers to this Ziffr, the section says "Not working" and the reason below the title, and **Test Telegram** is not offered. **Check Telegram** asks Telegram again, tells it where to send answers again, and shows Telegram's last error about reaching this Ziffr, if there was one in the last hour.

**Test Telegram** checks the whole way, like the test email does for mail. It shows **Open the bot in Telegram**, a link that works once, for ten minutes. Open it and tap **Start**: the bot sends "Ziffr test from …: reply to this message with any number to finish." Reply to that message with any number, such as 1. The bot answers "Telegram works", and the page shows "Tested just now: message sent, answer received". While you do this, the page says what it is waiting for: "No Start yet" means the link was not opened; "Sent, no answer yet" means Ziffr reached Telegram but your answer has not come back, so Telegram may not reach this Ziffr: try **Check Telegram**. The test connects you to no Workspace and changes nobody's Deliveries. You can run it five times an hour.

**Remove** takes the token off the page and tells Telegram to stop sending answers here; Workspaces then reach nobody by Telegram. Saving another token does the same for the bot before it. Like the mail server, the token is a secret: once saved, the page shows only that it is saved and its last four characters.

## Slack

Ziffr sends requests for values to people's Slack and takes their answers once the Installation has a Slack app. One app serves the whole Installation; each Workspace then connects its own Slack workspace on its Connectors page.

1. Choose **Create the Slack app**. Slack opens with Ziffr's manifest already filled in for this Ziffr's address. Pick the Slack workspace that owns the app and choose **Create**. If the page says Slack only talks to an https address, whoever runs the server sets this Ziffr's https address there first.
2. On the app's **Basic Information** page in Slack, under **App Credentials**, copy the **Client ID**, the **Client Secret** and the **Signing Secret** into the three fields and choose **Save**. "Working" next to the title means Ziffr has all three.
3. Slack tried the events address once when the app was made, before Ziffr knew the signing secret. In Slack, open the app's **App Manifest** page and choose **Verify** next to the events address. Reload Ziffr's page: "Slack has checked the events address" means Slack reached this Ziffr and signed its request with the secret you saved. If it does not appear, copy the Signing Secret again.

Without an https address the page shows neither step 1 nor step 2, so the line about the events address carries no number.

Slack cannot check the Client ID and Client Secret until a Slack workspace is connected. The next step is in a Workspace: an Owner or Admin opens **Connectors** and chooses **Add to Slack**. If the Client ID or Client Secret is wrong, that is where it shows.

To connect Slack workspaces other than the one that owns the app, turn on **Manage Distribution** for the app in Slack. The Client Secret and the Signing Secret are secrets: once saved, the page shows only that they are saved and their last four characters. Saving a new Signing Secret means asking Slack to verify the events address again.

## Workspace Limits

A **Workspace Limit** is the most Metrics a Workspace may hold. Archived Metrics do not count; Derived Metrics do. Without a default and without a limit of its own, a Workspace has no limit, which is how most Installations run.

- **Default limit** and **Name of the default** apply to every Workspace without a limit of its own, such as 10 and "Free". Empty means no limit. "Working" next to the title means a default is set. The demo never has a limit, and a Trial Workspace keeps its own rule of 25 Metrics while it runs.
- **Workspaces** lists every Workspace by name with how many Metrics it holds and its limit, marked "the default" when it has none of its own, and since when it is over its limit. Nothing else of a Workspace is shown: being an Installation Admin still shows no Workspace's data.
- **Change** on a Workspace sets a limit of its own: the most Metrics (empty for no limit at all) and its name, such as "Team". **Use the default** gives it back to the default. Under a limit of its own the page says who set it and when; a limit set by Ziffr Cloud says so, and saving here overrides it until Ziffr Cloud sets it again.

Over its limit a Workspace keeps everything working: its Metrics, values, Prompts, Workflows, dashboards and the API, and values keep arriving. The first Metric that takes it over starts 14 days in which it may hold 10 % more (at least one Metric more). After that, no new Metric can be made, and no Archived Metric brought back, while it holds as many Metrics as its limit or more. People who try are told how many Metrics the Workspace holds and to archive one or ask an Owner. A limit set below what a Workspace already holds starts the 14 days the same way. Each change is in the Workspace's **Audit Log** and in **Changes** below.

**Delete unused Workspaces after** (empty: never) deletes Workspaces nobody uses, only those on the default limit, only while a default limit is set and only where this Ziffr sends email, by which the warning must reach the Owners. A Workspace counts as used when anyone of it signs in or opens a page while signed in, or a value arrives for one of its Metrics by any Source. After the days you set (30 to 3650; hosted Ziffr uses 90) without use, every Owner gets one email (always by email, whatever Connector they prefer): what will be deleted and on which day, 14 days later, that one sign-in or one value keeps it, and a link to download its values. Still unused on that day, the Workspace is deleted: its key is destroyed first, so nothing of it can be read again, and a person whose only Workspace it was goes with their sign-in, unless they are an Installation Admin. A warning older than three weeks no longer counts, and one whose email was not sent never deletes: the Workspace is warned again first. Reading a Workspace only through View Links, the API or an assistant does not count as use. **Changes** keeps one line by the Workspace's id that it was deleted as unused. Trials, the demo and Workspaces with a limit of their own (such as a paid Size) are never deleted this way.

## Marketplace

The **Marketplace** lists Packs others made: ready-made Metric Catalog entries, templates, designs and Themes. The connection is off unless you turn it on; without it, Owners and Admins install Packs from a file.

- **Connection**: `on` or `off`. "Working" next to the title means it is on and its address is accepted.
- **Marketplace address**: empty for Ziffr's own. It starts with `https://`, has no user or `?` part, and is never inside this server's own network (unless the server allows it with `ZIFFR_ALLOW_PRIVATE_MARKETPLACE=1`).

With it on, this server, never a browser, asks the Marketplace for lists of Packs, a Pack's file and, once a day, which installed Packs have newer versions. It sends a search, a Pack's id and version, the list of Packs installed from the Marketplace on this Installation (not by Workspace) and Ziffr's version. It never sends a Workspace's name, id or data, nor anyone's. Every Pack's file must carry the Marketplace's signature and passes every check before anyone sees it.

## Set on the server

A setting your server's settings file already has wins over the page. The page then shows it as **Set on the server**, and it can be changed only there. Nothing changes for a Ziffr that was set up with a file.

## Check against bots

A Ziffr that strangers can reach should check that whoever asks for a sign-in link is a person: otherwise a program could make it email any address. Ziffr uses Cloudflare Turnstile.

1. In the Cloudflare dashboard, under **Turnstile**, choose **Add widget**, add this Ziffr's domain, and pick the mode **Managed**.
2. Copy the widget's **Site key** and **Secret key** into the two fields and choose **Save**.

Ziffr asks Cloudflare whether it knows the secret key first and saves nothing Cloudflare does not know, so a wrong key never shuts everyone out of signing in. Once both are saved, the section says "Working", and the sign-in form shows the check: no link is sent and no provider opens until it is passed. The secret key is shown like any secret: only that it is saved and its last four characters.

## Trials

With trials on, anyone who signs in may start a **Trial Workspace** of their own, and every Workspace made on this Ziffr is one. Use it on a Ziffr of its own, never one your team works in.

- **Days a trial lasts**: 1 to 30. Setting it turns trials on; **Remove** turns them off, and trials that run go on until they end.
- **Trials at once**: the most trials that may run at the same time; empty means 200.
- **When a trial ends**: close it and delete it a week later (the default), or keep it as an ordinary Workspace on the default Workspace Limit (see Workspace Limits): invitations open, every Connector reaches everyone, and its keys keep the end date they were made with.

The section then says, for example, "Trials of 14 days, at most 200 at once. Every Workspace made here is one." The sign-in page shows the trial next to the demo, with what works in a trial on this Ziffr. Set up the check against bots too.

## Usage

The **Usage** section shows what this Installation is used for, as daily counts: how many Workspaces and people there are, how many Metrics, dashboards and decks, how many values arrived by each Source, how many calls programs made and how often dashboards, decks and Metrics were opened. It never shows a Workspace's or a Metric's name, a person or a value, and nothing is sent anywhere. Ziffr counts each day at 04:40 UTC, for the day before, so a new Installation shows figures from its second day.

**How each figure is counted.** Calls (`api_calls`, `feed_calls`, `mcp_calls`) are counted in memory by each server and written once a minute, so a crash loses at most a minute; Like values by Source, `feed_calls` and `mcp_calls` are left out of a day when fewer than 3 Workspaces made such calls. `mcp_calls` are the calls the remote MCP Server makes for a connected assistant, while a local MCP Server uses an ordinary Access Key and counts as `api_calls`. Values arrive by Source: `values_feed` are those a Feed sent, `values_mcp` those of a connected assistant, `values_api` those of a person's Access Key; a Derived Metric is computed when it is opened and never recorded, so it has no figure. `signups` are accounts made that day by people who belong to a Workspace in the figures. `people_active_7d` counts people whose account signed in within 7 days, so someone whose session stays open for weeks is not counted; `workspaces_active_7d` counts Workspaces used within 7 days, where a value from any Source is use too. `trials_started`, `sizes_booked` (a Size booked by Ziffr Cloud) and `workspaces_deleted` are counts of events, nothing about which Workspace. If a day's count was missed, the next run rebuilds its events from the records and the states that a creation date can show (Workspaces, people, Metrics, dashboards, decks, Feeds, Packs installed); anything deleted since is not counted, so such a day can be a little low, and the kinds of Workspace, Workflows and the 7-day figures are left out for it. Calls and openings of a missed day are lost.

Under **The last 30 days**, the page lists the days newest first. With fewer than 3 Workspaces, only totals are shown, nothing split by kind, Source or Pack; and in a larger Installation a figure for one kind of Workspace or one Source is left out of a day when fewer than 3 Workspaces are behind it, so that nobody running a shared Installation gets a view of one small Workspace. Per-Pack figures appear only for Packs from the Marketplace that at least 3 Workspaces hold.

**Usage Key.** A program can read the same figures from `GET /api/v1/installation/usage` with a Usage Key. Choose **Make a Usage Key**: the page shows the key once, with **Copy**, and keeps only a fingerprint of it. There is one key at a time; **Make a new Usage Key** replaces it at once, and **Revoke** ends it. The key opens that one address and nothing else: it is not an Access Key, it sees no Workspace, and the job secret does not open the address either. Anyone else, with a wrong or revoked key, gets "not found". A Usage Key may call it 60 times an hour. The changes list says when a key was made or revoked, never the key.

**Workspace left out.** Pick one of the Workspaces you own, by name, usually the one that holds your own numbers, to leave it out of every figure and of the count of Workspaces, so those numbers do not count themselves. Only a Workspace you own can be picked, and only its Owner can change or remove the choice: leaving a Workspace out changes the next day's totals by exactly that Workspace, so two days side by side would show its size. It takes effect with the next day's count. The setting holds the Workspace's id (`ZIFFR_USAGE_EXCLUDE_WORKSPACE`); the endpoint never names the Workspace.

## Encryption

Every Workspace has a **Workspace Key** of its own, kept only wrapped under this Installation's `ZIFFR_SECRETS_KEY`, and Ziffr seals the words people write, its Contacts' details and the Outbox, the intake log and the Audit Log with it. Rows written before an upgrade are in clear until a job seals them, a few hundred at a time, every five minutes; nothing stops while it runs. The **Encryption of Workspaces** section shows how far it is.

- At the top, how many Workspaces are fully encrypted and have a key, how many values are still in clear and how many are moving to a newer key version. Without `ZIFFR_SECRETS_KEY` the section says that nothing is encrypted, and the job waits until the key is set.
- **Held back** rows are ones the job could not seal, such as two Contacts of one Workspace with the same address. Nothing is deleted; a Workspace's Owners can remove one of them. Values that **do not open** (changed in the database, or copied from another place) are counted apart and left alone.
- A table by kind of value: how many there are, how many are still in clear and in how many Workspaces the kind is done.
- A list of Workspaces, the ones that need most attention first, with their key versions, whether a key is still wrapped under the previous Installation key, and how many values are in clear. When a line says so for no Workspace, `ZIFFR_SECRETS_KEY_PREVIOUS` can go.

The page shows counts and version numbers only, never a key, not even in wrapped form. Back up `ZIFFR_SECRETS_KEY` apart from the database: without it, the database holds nothing readable of any Workspace.

## Demo

**Offer the demo** decides whether the sign-in page has **Try the demo**: **Offered on the login page** or **Not offered**. A Ziffr run with Docker on a domain has the demo off on the server, where the page shows it as set on the server; the person who runs it offers the demo there in the server's settings file. On a laptop the demo is offered unless you choose otherwise here. The section says whether the sign-in page offers it. A Ziffr that is a public demo and nothing else is set so on the server; the section then says so, and nobody signs in there.

## Changes

**Changes** lists who changed what, and when: claiming, adding and removing Installation Admins, saving or removing a setting such as the mail server, the replies signing secret, the Turnstile secret key, trials, the demo, the Telegram bot token or the Slack Client Secret, a Workspace's limit, test emails and replies tests. It names the setting, never its value. When Ziffr deletes a Workspace, such as a trial that ended, it shows one line by **Ziffr** with the Workspace's id, never its name, at the moment it destroys the Workspace's key, the first step of the deletion. What is left of it in the database, or in backups taken afterwards, can no longer be opened; backups from before the deletion open until they expire.
