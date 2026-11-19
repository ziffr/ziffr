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

Once you are an Installation Admin, your menu in the top bar has **Installation settings**.

## Other Installation Admins

Under **Installation Admins**, add someone by the email address they signed in with. They must have signed in to this Ziffr once before. **Remove** takes someone off the list, yourself included, but the last one stays: add another one first. People named on the server stay until the server's settings change.

## Mail

Ziffr sends requests for values, reminders, replies and invitations by email once it has a mail server.

- **Mail server**: the address of your SMTP server with its user and password, such as `smtps://user:password@smtp.example.com:465`.
- **Sender**: the address emails come from, with a name if you like, such as `Ziffr <ziffr@example.com>`. Your mail server must be allowed to send as it.

Choose **Save**: it works at once, without restarting Ziffr. Then choose **Send a test email to yourself**. It goes to the address you signed in with, at most ten times an hour. If it fails, the page says one of: could not reach the mail server, the mail server refused the login, it refused the sender or recipient, or it did not work. "Working" next to the section's title means Ziffr has what it needs to send.

A mail server inside the server's own network, such as `localhost` or `10.0.0.5`, is refused unless whoever runs the server allows it. Options after a `?` are refused too.

The mail server is a secret. Once saved, the page never shows it again, only that it is saved and its last four characters. To change it, type a new one; to keep it, leave the field empty.

Sign-in links are sent by the sign-in service, which still takes its mail server from the server's settings.

## Telegram

Ziffr asks for values and takes the answers by Telegram once it has a bot. One bot serves the whole Installation; each Workspace then turns Telegram on for itself on its Connectors page.

1. In Telegram, open **@BotFather**, send `/newbot`, and give the bot a name and a username ending in `bot`.
2. Copy the **token** BotFather sends, such as `7000000001:AAF…`. Whoever has it can send and read as the bot, so keep it to yourself.
3. Paste it under **Bot token** and choose **Save**.

Ziffr asks Telegram about the token first and saves nothing Telegram refuses. Then it tells Telegram where to send answers, and the page names the bot: "Saved: @acme_ziffr_bot". "Working" next to the title and "Bot @acme_ziffr_bot" below it mean Workspaces can turn Telegram on.

If Telegram could not be told where to send answers, the token is saved anyway and the page says why. This Ziffr's address must start with `https://`, or the server must fetch answers itself (polling, for a laptop). **Check Telegram** asks Telegram again, tells it where to send answers again, and shows Telegram's last error about reaching this Ziffr, if there was one in the last hour.

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

## Set on the server

A setting your server's settings file already has wins over the page. The page then shows it as **Set on the server**, and it can be changed only there. Nothing changes for a Ziffr that was set up with a file.

## Sections still to come

Replies by email, the check against bots, trials and the demo are listed with what they are for. Until the page can set them up, they are set in the server's settings, as the self-hosting guide says.

## Changes

**Changes** lists who changed what, and when: claiming, adding and removing Installation Admins, saving or removing a setting such as the mail server, the Telegram bot token or the Slack Client Secret, and test emails. It names the setting, never its value.
