// The Installation Settings there are (spec 0025; GLOSSARY: Installation Settings): one section per thing the
// Installation talks to, and the settings in each, named as their environment variables. Pure, so the page can list
// them; the values and their checks live on the server (settings-in-effect.ts, installation-settings.ts).
import { FEEDBACK_INSTALLATION_CAP, FEEDBACK_INSTALLATION_CAP_HELP } from "./feedback-rules";
import { SENDING_LIMITS } from "./sending-limits";
import { TRIAL_LIMITS } from "./trial-limits";
import { SLIDE_EDITOR_KEY_MAX } from "./slide-editor-license";

/** A section of the Installation Settings page. */
export type SettingsSectionId = "mail" | "replies" | "telegram" | "slack" | "slides" | "limits" | "sending" | "keep" | "marketplace" | "bots" | "trial_limits" | "trials" | "demo" | "usage" | "feedback";

/** One setting: its environment variable, its words on the page, and whether its value is a secret. */
export type SettingDefinition = { name: string; section: SettingsSectionId; label: string; help: string; secret: boolean; placeholder?: string; choices?: { value: string; label: string }[]; /** The longest value taken, where the usual 1000 characters are too few. */ maxLength?: number };

/** One section: what it is for, and whether the page can set it up yet (the others are listed as coming). */
export type SettingsSection = { id: SettingsSectionId; title: string; purpose: string; ready: boolean };

/** The sections, in the order the page shows them. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "mail", title: "Mail", purpose: "Every email Ziffr sends: sign-in links, requests for values, reminders, replies and invitations. Sign-in links go through it where Supabase Auth hands them to Ziffr, as Docker sets up.", ready: true },
  { id: "replies", title: "Replies by email", purpose: "People answer a request for a value, a question or a task by replying to its email. Your inbound mail provider takes the replies and forwards each one to Ziffr, signed.", ready: true },
  { id: "telegram", title: "Telegram", purpose: "A bot that asks for values and takes the answers in Telegram. Each Workspace turns it on for itself.", ready: true },
  { id: "slack", title: "Slack", purpose: "Ziffr's Slack app, which Workspaces connect to their Slack with one click.", ready: true },
  { id: "slides", title: "Slide editor", purpose: "Decks and free layouts are drawn with tldraw. Free layouts are offered only with a license key. On an https address tldraw shows both only with a key from tldraw (https://tldraw.dev/pricing: a 100-day free trial, commercial and hobby licenses); without one a notice stands in their place. The license must list the domain people reach Ziffr at. The key goes to the browser of whoever sees a deck or a free layout, View Links included.", ready: true },
  { id: "limits", title: "Workspace Limits", purpose: "The most Metrics a Workspace may hold, Archived Metrics not counted. Without a default or a limit of its own, a Workspace has no limit.", ready: true },
  { id: "sending", title: "Sending limits", purpose: "How much one Workspace, person or key may send and store in a day: emails, chat messages, Alerts, values, calls, Webhooks, sign-in links. They keep one Workspace or one program from using up the mail provider, the chat apps or the server. Each has a range, and none can be switched off. Lowering one never deletes or stops what exists: only what is new waits. The same for every Workspace, whatever its Metrics limit.", ready: true },
  { id: "keep", title: "How long logs are kept", purpose: "How long the Audit Log, the log of calls by key, the log of Webhook sends and the View Counts are kept, and how many old values one night of Retention takes. What is older than this goes by itself; what is younger is never removed.", ready: true },
  { id: "marketplace", title: "Marketplace", purpose: "Owners and Admins find, install and update Packs from the Marketplace. Off unless turned on: then this server, never a browser, asks the Marketplace for lists of Packs, their files and which installed Packs have newer versions. It sends a search, a Pack's id and version, the list of Packs installed on this Installation and Ziffr's version; never a Workspace's name, id or data, nor anyone's. Every Pack is checked in full, and its signature too, before it is shown.", ready: true },
  { id: "bots", title: "Check against bots", purpose: "Cloudflare Turnstile on the sign-in page: a bot cannot make Ziffr send sign-in links to any address it likes. Worth it on any Ziffr strangers can reach, and more so with trials.", ready: true },
  { id: "trial_limits", title: "Trial Limits", purpose: "The numbers that bound every trial: how long one lasts, how many run at once, and what one may hold and send. Ziffr Cloud may set them too; what it sets shows here and cannot be changed here. A change applies to running trials at once, except the days, which apply to trials made afterwards. Lowering one never deletes or stops what a trial has: only what is new waits.", ready: true },
  { id: "trials", title: "Trials", purpose: "What happens when a trial ends, and whether trials may have Webhooks. Whether trials are offered at all, for how long and how many at once is set under Trial Limits: with a number of days there, every Workspace made here is a trial.", ready: true },
  { id: "usage", title: "Usage", purpose: "What this Installation is used for, as daily counts: Workspaces, people, Metrics, values by Source, calls and what was opened. Never a Workspace's or a Metric's name, a person or a value. A Usage Key lets a program read the counts and nothing else; nothing is sent anywhere.", ready: true },
  { id: "feedback", title: "Feedback", purpose: "Whether Ziffr now and then asks signed-in people if they like it, and points those who do to the repository on GitHub, where they can star it themselves. Nothing is sent to GitHub. What people say is missing is kept without their name and shown below to Installation Admins only.", ready: true },
  { id: "demo", title: "Demo", purpose: "Whether the login page offers the demo: a made-up company anyone can look around without an account, where nothing is saved unless a demo-only Ziffr lets visitors try the everyday work.", ready: true },
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
    help: "The name your provider writes in Authentication-Results; with it, replies from vouched-for senders are taken at once; any other reply waits for the person to confirm it by a link." },
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
  { name: "ZIFFR_TRIAL_THEN", section: "trials", label: "When a trial ends", secret: false, choices: [{ value: "delete", label: "Close it, and delete it a week later" }, { value: "keep", label: "Keep it as a Workspace on the default limit" }],
    help: "Keep turns an ended trial into an ordinary Workspace on the default Workspace Limit (set one under Workspace Limits): invitations open and every Connector reaches everyone. Empty: delete." },
  { name: "ZIFFR_TRIAL_WEBHOOKS", section: "trials", label: "Webhooks in trials", secret: false, choices: [{ value: "true", label: "Trials may have Webhooks" }, { value: "false", label: "Trials have no Webhooks" }],
    help: "On by default: a trial may hold 2 Webhooks (Workspace and personal together) and send 200 a day, to public addresses only; the hosts you list in ZIFFR_WEBHOOK_PRIVATE_HOSTS never apply to a trial. Off: trials cannot add Webhooks, and those they have send nothing. Ordinary Workspaces are not affected." },
  { name: "ZIFFR_KEEP_AUDIT_DAYS", section: "keep", label: "Days the Audit Log is kept", secret: false, placeholder: "730",
    help: "365 to 3,650 (730 is two years). The Audit Log says who changed who may see or do what; below 730 days it is a weaker record. Never shorter than the age of an event that a Retention or an Approval still refers to." },
  { name: "ZIFFR_KEEP_ACCESS_LOG_DAYS", section: "keep", label: "Days the log of calls by key is kept", secret: false, placeholder: "90",
    help: "7 to 730. Which key called which address, and when. Shorter is more private; longer lets you answer for access a year back." },
  { name: "ZIFFR_KEEP_WEBHOOK_LOG_DAYS", section: "keep", label: "Days the Webhook send log is kept", secret: false, placeholder: "14",
    help: "1 to 90. The log an Owner reads to find out why a Webhook did not arrive. Shorter saves disk; longer gives time to find out why a partner stopped answering." },
  { name: "ZIFFR_KEEP_VIEW_COUNT_DAYS", section: "keep", label: "Days View Counts are kept", secret: false, placeholder: "400",
    help: "90 to 800. How often a dashboard, a deck or a Metric was opened per day, never by whom. Over a year lets you compare a quarter with last year's." },
  { name: "ZIFFR_RETENTION_VALUES_PER_RUN", section: "keep", label: "Values one Retention takes a night", secret: false, placeholder: "5000",
    help: "500 to 100,000. The most original values one Metric's Retention condenses in a night. Years of values take weeks to catch up at 5,000; more is more work for the database at night." },
  { name: "ZIFFR_FEEDBACK_PROMPT", section: "feedback", label: "Ask people whether they like Ziffr", secret: false, choices: [{ value: "true", label: "Ask now and then" }, { value: "false", label: "Never ask" }],
    help: "A small card, at most three times per person, after they have submitted values on a few different days; never in the demo, for Guests or on View Links. Empty: on for hosted Ziffr, off everywhere else." },
  { name: "ZIFFR_FEEDBACK_MODE", section: "feedback", label: "Feedback from people", secret: false, choices: [{ value: "direct", label: "Post directly" }, { value: "review", label: "Review first" }],
    help: "The central version (ziffr.net) only. Post directly (the default): each feedback is filed on GitHub as it arrives. Review first: each waits in the review queue until a maintainer approves it, edits it or rejects it with a reason. A change applies to new feedback; what already waits stays waiting." },
  { name: FEEDBACK_INSTALLATION_CAP.name, section: "feedback", label: FEEDBACK_INSTALLATION_CAP.label, secret: false, placeholder: String(FEEDBACK_INSTALLATION_CAP.default), help: FEEDBACK_INSTALLATION_CAP_HELP },
  { name: "ZIFFR_DEMO", section: "demo", label: "Offer the demo", secret: false, choices: [{ value: "1", label: "Offered on the login page" }, { value: "0", label: "Not offered" }],
    help: "Whether the login page has Try the demo." },
  { name: "ZIFFR_DEMO_CHANGES", section: "demo", label: "Visitors may change the demo", secret: false, choices: [{ value: "1", label: "Visitors may change the demo" }, { value: "0", label: "The demo is read-only" }],
    help: "Only in a demo-only Ziffr (ZIFFR_DEMO_ONLY on the server). What visitors change is seen by every visitor and gone when the demo starts fresh, every 15 minutes. Off, or in any other Ziffr, the demo is read-only." },
  { name: "ZIFFR_TLDRAW_LICENSE_KEY", section: "slides", label: "tldraw license key", secret: false, placeholder: "tldraw-…", maxLength: SLIDE_EDITOR_KEY_MAX,
    help: "The key tldraw gave you, copied whole, in one line. Ziffr cannot check it: after saving, open a deck on this address and look for more than five seconds." },
  { name: "ZIFFR_DEFAULT_METRICS_LIMIT", section: "limits", label: "Default limit", secret: false, placeholder: "No limit",
    help: "The most Metrics a Workspace may hold unless it has a limit of its own. Empty: no limit. Over it, a Workspace keeps everything and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more." },
  { name: "ZIFFR_DEFAULT_LIMIT_LABEL", section: "limits", label: "Name of the default", secret: false, placeholder: "Standard",
    help: "What Owners and Admins see the default called, such as Standard. At most 30 characters." },
  ...TRIAL_LIMITS.map((l): SettingDefinition => ({ name: l.name, section: "trial_limits", label: l.label, secret: false, placeholder: String(l.default),
    help: `${l.help} ${l.min.toLocaleString("en-US")} to ${l.max.toLocaleString("en-US")}; empty: ${l.default.toLocaleString("en-US")}.` })),
  ...SENDING_LIMITS.map((l): SettingDefinition => ({ name: l.name, section: "sending", label: l.label, secret: false, placeholder: String(l.default),
    help: `${l.help} ${l.min.toLocaleString("en-US")} to ${l.max.toLocaleString("en-US")}; empty: ${l.default.toLocaleString("en-US")}.` })),
  { name: "ZIFFR_MARKETPLACE", section: "marketplace", label: "Connection", secret: false, placeholder: "off",
    help: "on lets this server talk to the Marketplace; off, or empty, makes no connection. Packs can always be installed from a file." },
  { name: "ZIFFR_MARKETPLACE_URL", section: "marketplace", label: "Marketplace address", secret: false, placeholder: "https://marketplace.ziffr.net",
    help: "Where the Marketplace is; empty: Ziffr's own. https only, and never inside this server's own network." },
  { name: "ZIFFR_DELETE_UNUSED_AFTER_DAYS", section: "limits", label: "Delete unused Workspaces after", secret: false, placeholder: "Never",
    help: "Days without a sign-in and without values after which a Workspace on the default limit is warned; 14 days after the warning, still unused, it is deleted with its key. 30 to 3650; empty: never. Never a trial, the demo or a Workspace with a limit of its own." },
  { name: "ZIFFR_LIMIT_GRACE_DAYS", section: "limits", label: "Days over the limit", secret: false, placeholder: "14",
    help: "0 to 90. How long a Workspace may stay over its limit, within 10 % more, before new Metrics wait. 0: the limit holds at once." },
  { name: "ZIFFR_LIMIT_GRACE_EVERY_DAYS", section: "limits", label: "Days between two such periods", secret: false, placeholder: "90",
    help: "0 to 730. After a Workspace's days over the limit started, this many days must pass before it gets others. 0: a Workspace gets them again whenever it comes back under its limit." },
  { name: "ZIFFR_UNUSED_WAIT_DAYS", section: "limits", label: "Days from warning to deletion", secret: false, placeholder: "14",
    help: "7 to 90. How long after its warning an unused Workspace is deleted. The days promised in a warning that went out stay as they were told." },
  { name: "ZIFFR_USAGE_EXCLUDE_WORKSPACE", section: "usage", label: "Workspace left out", secret: false, placeholder: "None",
    help: "One Workspace, usually your own for the numbers, that is left out of every figure and of the count of Workspaces. Pick it by name; the setting holds its id." },
];

/** The setting of this name, or undefined for any name the page does not know. */
export const settingNamed = (name: string): SettingDefinition | undefined => INSTALLATION_SETTINGS.find((s) => s.name === name);

/** Whether a setting is one that makes trials (the days and the cap), which only hosted Ziffr has (spec 0040): never
 * read from a stored row or a `_DEFAULT` without a Ziffr Cloud key. The settings for how an existing trial ends (then,
 * Webhooks, grace days) are not in it: without a key they only ever govern trials that already exist, so a stored
 * "keep" must not silently turn into "delete". */
export const isTrialSetting = (name: string): boolean => name === "ZIFFR_TRIAL_DAYS" || name === "ZIFFR_TRIAL_MAX";
