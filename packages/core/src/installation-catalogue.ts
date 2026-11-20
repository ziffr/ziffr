// The Installation Settings there are (spec 0025; GLOSSARY: Installation Settings): one section per thing the
// Installation talks to, and the settings in each, named as their environment variables. Pure, so the page can list
// them; the values and their checks live on the server (settings-in-effect.ts, installation-settings.ts).

/** A section of the Installation Settings page. */
export type SettingsSectionId = "mail" | "replies" | "telegram" | "slack" | "limits" | "marketplace" | "bots" | "trials" | "demo";

/** One setting: its environment variable, its words on the page, and whether its value is a secret. */
export type SettingDefinition = { name: string; section: SettingsSectionId; label: string; help: string; secret: boolean; placeholder?: string; choices?: { value: string; label: string }[] };

/** One section: what it is for, and whether the page can set it up yet (the others are listed as coming). */
export type SettingsSection = { id: SettingsSectionId; title: string; purpose: string; ready: boolean };

/** The sections, in the order the page shows them. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "mail", title: "Mail", purpose: "Every email Ziffr sends: sign-in links, requests for values, reminders, replies and invitations. Sign-in links go through it where Supabase Auth hands them to Ziffr, as Docker sets up.", ready: true },
  { id: "replies", title: "Replies by email", purpose: "People answer a request for a value, a question or a task by replying to its email. Your inbound mail provider takes the replies and forwards each one to Ziffr, signed.", ready: true },
  { id: "telegram", title: "Telegram", purpose: "A bot that asks for values and takes the answers in Telegram. Each Workspace turns it on for itself.", ready: true },
  { id: "slack", title: "Slack", purpose: "Ziffr's Slack app, which Workspaces connect to their Slack with one click.", ready: true },
  { id: "limits", title: "Workspace Limits", purpose: "The most Metrics a Workspace may hold, Archived Metrics not counted. Without a default or a limit of its own, a Workspace has no limit.", ready: true },
  { id: "marketplace", title: "Marketplace", purpose: "Owners and Admins find, install and update Packs from the Marketplace. Off unless turned on: then this server, never a browser, asks the Marketplace for lists of Packs, their files and which installed Packs have newer versions. It sends a search, a Pack's id and version, the list of Packs installed on this Installation and Ziffr's version; never a Workspace's name, id or data, nor anyone's. Every Pack is checked in full, and its signature too, before it is shown.", ready: true },
  { id: "bots", title: "Check against bots", purpose: "Cloudflare Turnstile on the sign-in page: a bot cannot make Ziffr send sign-in links to any address it likes. Worth it on any Ziffr strangers can reach, and more so with trials.", ready: true },
  { id: "trials", title: "Trials", purpose: "Whether anyone may sign in and try Ziffr in a Trial Workspace of their own, for how long and how many at once. With trials on, every Workspace made here is a trial.", ready: true },
  { id: "demo", title: "Demo", purpose: "Whether the login page offers the demo: a made-up company anyone can look around without an account, where nothing is saved.", ready: true },
];

/** Every setting the page knows, in the order the page shows them. Only these are ever read from the database. */
export const INSTALLATION_SETTINGS: SettingDefinition[] = [
  { name: "ZIFFR_SMTP_URL", section: "mail", label: "Mail server", secret: true, placeholder: "smtps://user:password@smtp.example.com:465",
    help: "The SMTP server, with its user and password: smtps:// for port 465, smtp:// for 587 or 25." },
  { name: "ZIFFR_MAIL_FROM", section: "mail", label: "Sender", secret: false, placeholder: "Ziffr <ziffr@example.com>",
    help: "The address emails come from, with a name if you like. Your mail server must be allowed to send as it." },
  { name: "ZIFFR_INBOUND_DOMAIN", section: "replies", label: "Domain for replies", secret: false, placeholder: "in.ziffr.example.com",
    help: "The domain replies go to; its MX record points at your inbound mail provider." },
  { name: "ZIFFR_INBOUND_SECRET", section: "replies", label: "Signing secret", secret: true,
    help: "Signs what the provider forwards to Ziffr; 32 characters or more." },
  { name: "ZIFFR_INBOUND_AUTHSERV_ID", section: "replies", label: "Provider that vouches for senders", secret: false, placeholder: "mx.example.com",
    help: "The name your provider writes in Authentication-Results; with it, only vouched-for senders are taken." },
  { name: "ZIFFR_TELEGRAM_BOT_TOKEN", section: "telegram", label: "Bot token", secret: true, placeholder: "1234567890:AA…",
    help: "Make a bot with @BotFather in Telegram (/newbot) and paste the token it gives you. Ziffr checks it with Telegram and tells Telegram where to send answers." },
  { name: "ZIFFR_SLACK_CLIENT_ID", section: "slack", label: "Client ID", secret: false, placeholder: "1234567890.1234567890",
    help: "On the app's Basic Information page in Slack, under App Credentials." },
  { name: "ZIFFR_SLACK_CLIENT_SECRET", section: "slack", label: "Client Secret", secret: true,
    help: "Under App Credentials too: choose Show and copy it." },
  { name: "ZIFFR_SLACK_SIGNING_SECRET", section: "slack", label: "Signing Secret", secret: true,
    help: "Under App Credentials too. Slack signs every request it sends Ziffr with it." },
  { name: "ZIFFR_TURNSTILE_SITE_KEY", section: "bots", label: "Site key", secret: false, placeholder: "0x4AAAAAAA…",
    help: "In the Cloudflare dashboard, under Turnstile, add a widget for this Ziffr's domain (mode Managed) and copy its site key. It must be the same widget's as the secret key: a wrong one stops every sign-in until it is removed." },
  { name: "ZIFFR_TURNSTILE_SECRET", section: "bots", label: "Secret key", secret: true,
    help: "The widget's secret key. Ziffr asks Cloudflare whether it knows it before saving it." },
  { name: "ZIFFR_TRIAL_DAYS", section: "trials", label: "Days a trial lasts", secret: false, placeholder: "7",
    help: "1 to 30. Set, it turns trials on: whoever signs in may start a Trial Workspace, and every Workspace made here is one. Remove it to turn trials off; trials that run go on until they end." },
  { name: "ZIFFR_TRIAL_MAX", section: "trials", label: "Trials at once", secret: false, placeholder: "200",
    help: "The most trials that may run at the same time. Empty: 200." },
  { name: "ZIFFR_TRIAL_THEN", section: "trials", label: "When a trial ends", secret: false, choices: [{ value: "delete", label: "Close it, and delete it a week later" }, { value: "keep", label: "Keep it as a Workspace on the default limit" }],
    help: "Keep turns an ended trial into an ordinary Workspace on the default Workspace Limit (set one under Workspace Limits): invitations open and every Connector reaches everyone. Empty: delete." },
  { name: "ZIFFR_DEMO", section: "demo", label: "Offer the demo", secret: false, choices: [{ value: "1", label: "Offered on the login page" }, { value: "0", label: "Not offered" }],
    help: "Whether the login page has Try the demo." },
  { name: "ZIFFR_DEFAULT_METRICS_LIMIT", section: "limits", label: "Default limit", secret: false, placeholder: "No limit",
    help: "The most Metrics a Workspace may hold unless it has a limit of its own. Empty: no limit. Over it, a Workspace keeps everything and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more." },
  { name: "ZIFFR_DEFAULT_LIMIT_LABEL", section: "limits", label: "Name of the default", secret: false, placeholder: "Free",
    help: "What Owners and Admins see the default called, such as Free. At most 30 characters." },
  { name: "ZIFFR_MARKETPLACE", section: "marketplace", label: "Connection", secret: false, placeholder: "off",
    help: "on lets this server talk to the Marketplace; off, or empty, makes no connection. Packs can always be installed from a file." },
  { name: "ZIFFR_MARKETPLACE_URL", section: "marketplace", label: "Marketplace address", secret: false, placeholder: "https://marketplace.ziffr.app",
    help: "Where the Marketplace is; empty: Ziffr's own. https only, and never inside this server's own network." },
  { name: "ZIFFR_DELETE_UNUSED_AFTER_DAYS", section: "limits", label: "Delete unused Workspaces after", secret: false, placeholder: "Never",
    help: "Days without a sign-in and without values after which a Workspace on the default limit is warned; 14 days after the warning, still unused, it is deleted with its key. 30 to 3650; empty: never. Never a trial, the demo or a Workspace with a limit of its own." },
];

/** The setting of this name, or undefined for any name the page does not know. */
export const settingNamed = (name: string): SettingDefinition | undefined => INSTALLATION_SETTINGS.find((s) => s.name === name);
