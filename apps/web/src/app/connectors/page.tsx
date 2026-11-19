import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { emailOptedOut } from "@ziffr/core/email-opt-out";
import { inboundOn, mailOn } from "@ziffr/core/mail";
import { slackConnection } from "@ziffr/core/slack-connection";
import { mySlackLink, slackOptedOut } from "@ziffr/core/slack-people";
import { telegramConnection } from "@ziffr/core/telegram-connection";
import { myTelegramLink, telegramOptedOut } from "@ziffr/core/telegram-people";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";
import { SlackPanel } from "./slack-panel";
import { TelegramPanel } from "./telegram-panel";
import { McpPanel } from "./mcp-panel";
import { whatWorksHere } from "@ziffr/core/what-works-here";
import { SITE_URL } from "@/lib/sign-in";
import { mcpUrl, remoteMcpEnabled } from "@/lib/remote-mcp";

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
  const viewer = actor.personId;
  // What the person may see is decided in the core: readable Deliveries, and only their own Token codes. The Slack
  // connection comes as its name only; its token never leaves the core (spec 0007). Telegram's bot comes as its
  // username only; its token stays in the environment (spec 0016).
  const [people, view, optedOut, demo, slack, slackLink, slackStopped, telegram, telegramLink, telegramStopped, { slack: outcome }] = await Promise.all([getProfiles(), connectorsView(actor), emailOptedOut(actor), isDemo(), slackConnection(actor), mySlackLink(actor), slackOptedOut(actor), telegramConnection(actor), myTelegramLink(actor), telegramOptedOut(actor), searchParams]);
  const ways = await whatWorksHere(actor);
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      {(slack.enabled || slack.team) && <SlackPanel connection={slack} link={slackLink} stopped={slackStopped} notice={outcome ? SLACK_OUTCOME[String(outcome)] : undefined} />}
      {telegram.configured && <TelegramPanel connection={telegram} linked={Boolean(telegramLink)} stopped={telegramStopped} />}
      {/* The demo has no Access Keys, so it offers no assistant. */}
      {!demo && <McpPanel siteUrl={SITE_URL} remote={remoteMcpEnabled() ? mcpUrl() : null} />}
      <ConnectorsScreen viewer={viewer} isOwner={view.isAdmin} people={people} prefs={view.prefs as PrefRow[]} deliveries={view.deliveries as unknown as DeliveryRow[]} tokens={view.tokens} optedOut={optedOut} demo={demo} email={(await mailOn()) ? ((await inboundOn()) ? "both" : "send") : "off"} slack={slack.team ? "connected" : "off"} telegram={telegram.enabled ? "on" : "off"} ways={ways} />
    </>
  );
}
