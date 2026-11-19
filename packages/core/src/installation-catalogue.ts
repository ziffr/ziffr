// The Installation Settings there are (spec 0025; GLOSSARY: Installation Settings): one section per thing the
// Installation talks to, and the settings in each, named as their environment variables. Pure, so the page can list
// them; the values and their checks live on the server (settings-in-effect.ts, installation-settings.ts).

/** A section of the Installation Settings page. */
export type SettingsSectionId = "mail" | "replies" | "telegram" | "slack" | "bots" | "trials" | "demo";

/** One setting: its environment variable, its words on the page, and whether its value is a secret. */
export type SettingDefinition = { name: string; section: SettingsSectionId; label: string; help: string; secret: boolean; placeholder?: string };

/** One section: what it is for, and whether the page can set it up yet (the others are listed as coming). */
export type SettingsSection = { id: SettingsSectionId; title: string; purpose: string; ready: boolean };

/** The sections, in the order the page shows them. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "mail", title: "Mail", purpose: "Sign-in links aside, every email Ziffr sends: requests for values, reminders, replies and invitations.", ready: true },
  { id: "replies", title: "Replies by email", purpose: "People answer a request for a value by replying to its email.", ready: false },
  { id: "telegram", title: "Telegram", purpose: "A bot that asks for values and takes the answers in Telegram. Each Workspace turns it on for itself.", ready: true },
  { id: "slack", title: "Slack", purpose: "Ziffr's Slack app, which Workspaces connect to their Slack with one click.", ready: false },
  { id: "bots", title: "Check against bots", purpose: "Cloudflare Turnstile on the sign-in page.", ready: false },
  { id: "trials", title: "Trials", purpose: "Whether anyone may sign in and try Ziffr in a Trial Workspace, for how long and how many at once.", ready: false },
  { id: "demo", title: "Demo", purpose: "Whether the login page offers the demo.", ready: false },
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
];

/** The setting of this name, or undefined for any name the page does not know. */
export const settingNamed = (name: string): SettingDefinition | undefined => INSTALLATION_SETTINGS.find((s) => s.name === name);
