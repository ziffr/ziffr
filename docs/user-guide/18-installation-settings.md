<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/installation/** -->
# Installation settings

This chapter is for the people who run a Ziffr for others: a team, a club or a company. If someone else runs your Ziffr, you never see this page, and you can skip it.

An **Installation** is one running Ziffr, with all its Workspaces. Its **Installation Settings** say what it talks to: the mail server first, and later Telegram, Slack, the check against bots and trials. The people who may change them are its **Installation Admins**. Being an Owner of a Workspace does not make you one, and being one shows you nothing of anyone's Workspace.

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

Choose **Save**: it works at once, without restarting Ziffr. Then choose **Send a test email to yourself**. It goes to the address you signed in with, and the page says whether the mail server took it. "Working" next to the section's title means Ziffr has what it needs to send.

The mail server is a secret. Once saved, the page never shows it again, only that it is saved and its last four characters. To change it, type a new one; to keep it, leave the field empty.

Sign-in links are sent by the sign-in service, which still takes its mail server from the server's settings.

## Set on the server

A setting your server's settings file already has wins over the page. The page then shows it as **Set on the server**, and it can be changed only there. Nothing changes for a Ziffr that was set up with a file.

## Sections still to come

Replies by email, Telegram, Slack, the check against bots, trials and the demo are listed with what they are for. Until the page can set them up, they are set in the server's settings, as the self-hosting guide says.

## Changes

**Changes** lists who changed what, and when: claiming, adding and removing Installation Admins, saving or removing a setting, and test emails. It names the setting, never its value.
