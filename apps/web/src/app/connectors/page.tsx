// Connectors → Channels (spec 0021; GLOSSARY: Connector): the Slack and Telegram connections and one card per Connector.
// AI assistants have their own place, Connected assistants, with a line pointing there (#532).
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { installationActor } from "@/lib/installation";
import { emailOptedOut } from "@ziffr/core/email-opt-out";
import { inboundOn, mailOn } from "@ziffr/core/mail";
import { slackConnection } from "@ziffr/core/slack-connection";
import { mySlackLink, slackOptedOut } from "@ziffr/core/slack-people";
import { telegramConnection } from "@ziffr/core/telegram-connection";
import { myTelegramLink, telegramOptedOut } from "@ziffr/core/telegram-people";
import { isDemo } from "@/lib/auth";
import { ChannelCards } from "./channels";
import { OptedOutNote } from "./opted-out";
import { SlackPanel } from "./slack-panel";
import { TelegramPanel } from "./telegram-panel";
import { whatWorksHere } from "@ziffr/core/what-works-here";

const SLACK_OUTCOME: Record<string, string> = {
  connected: "Slack is connected.",
  cancelled: "Slack was not connected.",
  refused: "That did not work: start “Add to Slack” again from here.",
  elsewhere: "That Slack workspace is already connected to another Ziffr workspace.",
  org_install: "Connect one Slack workspace, not a whole Enterprise organisation.",
  failed: "Slack did not answer as expected. Try again in a moment.",
};

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<{ slack?: string }> }) {
  const actor = await currentActor();
  // The Slack connection comes as its name only; its token never leaves the core (spec 0007). Telegram's bot comes as
  // its username only; its token stays in the environment (spec 0016). Only whether the person runs the Installation
  // is passed on, for a link.
  const [optedOut, demo, slack, slackLink, slackStopped, telegram, telegramLink, telegramStopped, { slack: outcome }, installer, ways, mail, inbound] = await Promise.all([emailOptedOut(actor), isDemo(), slackConnection(actor), mySlackLink(actor), slackOptedOut(actor), telegramConnection(actor), myTelegramLink(actor), telegramOptedOut(actor), searchParams, installationActor(), whatWorksHere(actor), mailOn(), inboundOn()]);
  return (
    <div className="space-y-12">
      {optedOut && <OptedOutNote />}
      {(slack.enabled || slack.team) && <SlackPanel connection={slack} link={slackLink} stopped={slackStopped} notice={outcome ? SLACK_OUTCOME[String(outcome)] : undefined} />}
      {telegram.configured && <TelegramPanel connection={telegram} linked={Boolean(telegramLink)} stopped={telegramStopped} />}
      <ChannelCards demo={demo} email={mail ? (inbound ? "both" : "send") : "off"} slack={slack.team ? "connected" : "off"} telegram={telegram.enabled ? "on" : "off"} ways={ways} installationAdmin={Boolean(installer) && !demo} />
      {/* The demo has no Access Keys, so it offers no assistant. */}
      {!demo && <p className="text-sm text-muted-foreground">To connect Claude or another AI assistant, open <Link href="/settings/assistants" className="underline">Connected assistants</Link>.</p>}
    </div>
  );
}
