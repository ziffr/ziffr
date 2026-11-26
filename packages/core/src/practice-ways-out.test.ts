// Every way out of Ziffr, classified (spec 0063; GLOSSARY: Practice Workspace). Nothing may leave a Practice Workspace
// unasked, so a file that starts to call a way out fails this test until somebody says here how it keeps that rule.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";

/** A call that sends something to somewhere else: mail, a chat, a request, or the sign-in service's mail. */
const WAY_OUT = /\b(sendMail|callSlack|callTelegram|outboundRequest)\s*(<[^()]*>)?\(|\bfetch(Impl)?\(|createTransport|signInWith(Otp|OAuth)\(|marketplaceTransport\.request\(|from "node:(https|http2|tls|dgram)"|new WebSocket\(/;

/** Each file that holds one, and how a Practice Workspace is kept out of it. */
const KEPT_BY: Record<string, string> = {
  // Email.
  "packages/core/src/mail.ts": "sendMail is refused for a Practice Workspace; sendDelivery asks heldBack with the very address it sends to; the SMTP transport takes no .invalid address",
  "packages/core/src/auth-email.ts": "a sign-in email, nobody's Workspace; a .invalid address is refused by sendMail",
  "packages/core/src/invitations.ts": "no invitation is made (assertMayLeave, and the database); sendMail gets the Workspace",
  "packages/core/src/inbound-email.ts": "the answer to an email goes through sendMail with the Workspace",
  "packages/core/src/share-proposals.ts": "no proposal by email is made or confirmed; sendMail gets the Workspace",
  "apps/web/src/app/auth-actions.ts": "signing in: a .invalid address is refused before the sign-in service is asked",
  // Slack. A bot is handed out by slackBot alone, and none for a Practice Workspace.
  "packages/core/src/slack-api.ts": "the call itself; every caller below is kept out",
  "packages/core/src/slack-send.ts": "sendSlackDelivery asks heldBack with the very account it sends to",
  "packages/core/src/slack-people.ts": "needs a bot from slackBot, and looks nobody up for a Practice Workspace",
  "packages/core/src/slack-inbound.ts": "say() asks mayAnswer with the account it answers",
  "packages/core/src/slack-connection.ts": "an install starts, and slackBot hands out a bot, only where Slack is switched on",
  "packages/core/src/prompt-ways.ts": "a Practice Workspace edits nothing it sent",
  // Telegram. It is on in a Workspace by telegramOnIn alone, and never in a Practice Workspace.
  "packages/core/src/telegram-api.ts": "the call itself; every caller below is kept out",
  "packages/core/src/telegram-send.ts": "sendTelegramDelivery asks heldBack with the very chat it sends to",
  "packages/core/src/telegram-connection.ts": "telegramOnIn is true only where Telegram is switched on; its other calls are the Installation's",
  "packages/core/src/telegram-confirm.ts": "no confirmation starts for a Practice Workspace; tellChat is asked with mayAnswer",
  "packages/core/src/telegram-inbound.ts": "answers about a Workspace's message ask mayAnswer with the chat; a link code's answer is quiet for another account",
  "packages/core/src/installation-telegram-test.ts": "an Installation Admin's own test of the bot, of no Workspace",
  "packages/core/src/installation-settings.ts": "the Installation's own settings checks, of no Workspace",
  // Requests.
  "packages/core/src/webhook-send.ts": "sendOne asks heldBack with the Webhook's maker",
  "packages/core/src/outbound-request.ts": "the request itself; its callers are webhook-send and marketplace",
  "packages/core/src/marketplace.ts": "reads a person asks for, which a Practice Workspace may; no report link is offered there",
  "packages/core/src/feedback-github.ts": "feedback is refused from a Practice Workspace when it is written",
  "apps/web/src/lib/turnstile.ts": "the check against bots at sign-in, of no Workspace",
  // In the browser, to Ziffr itself.
  "apps/web/src/app/welcome/import/form.tsx": "the browser, to Ziffr",
  "apps/web/src/canvas/series-store.tsx": "the browser, to Ziffr",
  "apps/web/src/components/demo-reset-line.tsx": "the browser, to Ziffr",
  "apps/web/src/components/help-panel.tsx": "the browser, to Ziffr",
  "apps/web/src/decks/slide-canvas.tsx": "the browser, to Ziffr",
  "apps/web/src/lib/connect-examples.ts": "words of an example, sending nothing",
};

const root = fileURLToPath(repoFile("./"));
/** The source files below a folder, tests and their helpers left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "test") return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? sources(path) : /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe("the ways out of Ziffr", () => {
  const found = ["packages/core/src", "apps/web/src", "extensions"].flatMap((d) => sources(join(root, d)))
    .filter((f) => WAY_OUT.test(readFileSync(f, "utf8"))).map((f) => relative(root, f)).sort();
  it("are each classified: how is a Practice Workspace kept out of a new one?", () => {
    expect(found.filter((f) => !(f in KEPT_BY))).toEqual([]);
  });
  it("have no entry left over", () => {
    expect(Object.keys(KEPT_BY).filter((f) => !found.includes(f))).toEqual([]);
  });
});
