"use server";
// Connectors (GLOSSARY: Connector, Delivery, Delivery Preference): thin calls into the core. In the demo anyone may
// play the recipient on Slack, email, WhatsApp or a ticket system (@ziffr/core/demo-channels); elsewhere those refuse.
import * as optOut from "@ziffr/core/email-opt-out";
import * as slackConnection from "@ziffr/core/slack-connection";
import * as slackPeople from "@ziffr/core/slack-people";
import * as telegramConnection from "@ziffr/core/telegram-connection";
import * as telegramPeople from "@ziffr/core/telegram-people";
import * as practiceWays from "@ziffr/core/practice-ways";
import * as testMessage from "@ziffr/core/test-message";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import { inDemoVisit } from "@/lib/demo-visit-action";
import { demoTextForVisit } from "@ziffr/core/demo-text";
import * as questions from "@ziffr/core/questions";
import * as screenLink from "@ziffr/core/screen-link";
import * as demo from "@ziffr/core/demo-channels";
import type { ConnectorId, PreferenceKind } from "@ziffr/core/connectors/index";

const done = () => revalidatePath("/", "layout");

/** Switches a way to oneself on or off in a Practice Workspace (spec 0063; the core decides who may, and checks the way). */
export async function setPracticeWay(way: string, on: boolean) {
  return attempt(async () => {
    await practiceWays.switchPracticeWay(await currentActor(), way, on === true);
    done();
  });
}

/** Turns Telegram on or off for the workspace (spec 0016; Owners and Admins, the core checks). */
export async function setTelegram(on: boolean) {
  return attempt(async () => {
    await telegramConnection.setTelegramEnabled(await currentActor(), on);
    done();
  });
}

/** "Connect Telegram" (spec 0016): a one-time link that opens the bot; only the link goes back. */
export async function telegramLinkStart() {
  return attempt(async () => {
    return telegramPeople.startTelegramLink(await currentActor());
  });
}

/** "Connect Telegram" on a personal form page: for the person whose form it is; the form code is the credential. */
export async function telegramFormLinkStart(formCode: string) {
  return attempt(async () => {
    return telegramPeople.startTelegramLinkByForm(String(formCode));
  });
}

/** The person gets Prompts and reminders on Telegram again in this workspace, after stopping them (spec 0016). */
export async function telegramRemindersAgain() {
  return attempt(async () => {
    await telegramPeople.telegramOptBackIn(await currentActor());
    done();
  });
}

/** The person forgets their Telegram link in this workspace. */
export async function telegramUnlink() {
  return attempt(async () => {
    await telegramPeople.unlinkTelegram(await currentActor());
    done();
  });
}

/** A person sets their own preference; the team default (userId null) is set by owners and admins. */
/** The person gets Prompts and reminders by email again in this workspace, after stopping them (spec 0004). */
export async function emailRemindersAgain() {
  return attempt(async () => {
    await optOut.optBackIn(await currentActor());
    done();
  });
}

/** "Add to Slack" (spec 0007): an Owner or Admin is sent to Slack with a one-time state; the core checks the role. */
export async function connectSlack() {
  // The redirect passes through attempt(); a refusal comes back as words for the form to show.
  return attempt(async () => {
    const url = await slackConnection.startSlackInstall(await currentActor());
    redirect(url);
  });
}

/** Disconnects the workspace's Slack (Owners and Admins; the core checks). */
export async function disconnectSlack() {
  return attempt(async () => {
    await slackConnection.disconnectSlack(await currentActor());
    revalidatePath("/connectors", "layout");
  });
}

/** "Send me a test" (spec 0052): a Test Message to the person themself by email, Slack or Telegram. The way is the only
 * input; the core decides the recipient (always the signed-in person) and the limits. The buttons come with ticket 8
 * of spec 0052 (Ways in and out), so nothing calls it yet.
 * @public */
export async function sendTestMessage(way: string) {
  return attempt(async () => {
    const result = await testMessage.sendTestMessage(await currentActor(), way);
    done();
    return result;
  });
}

/** "Send me the link" on a phone (spec 0055): the address of a screen made for a larger screen, emailed to the person
 * themself. The path is the only input; the core checks it against its list, decides the recipient and holds the limits. */
export async function sendScreenLink(path: string) {
  return attempt(async () => screenLink.sendScreenLink(await currentActor(), path));
}

/** A one-time code the person sends the Ziffr app on Slack to link their Slack account. Only the code goes back. */
export async function slackLinkCode() {
  return attempt(async () => {
    return slackPeople.startSlackLink(await currentActor());
  });
}

/** The person gets Prompts and reminders on Slack again in this workspace, after stopping them (spec 0007). */
export async function slackRemindersAgain() {
  return attempt(async () => {
    await slackPeople.slackOptBackIn(await currentActor());
    revalidatePath("/connectors", "layout");
  });
}

/** The person forgets their link to Slack in this workspace. */
export async function unlinkSlack() {
  return attempt(async () => {
    await slackPeople.unlinkSlack(await currentActor());
    revalidatePath("/connectors", "layout");
  });
}

/** Sets a Delivery Preference. */
export async function setPreference(userId: string | null, kind: PreferenceKind, connector: ConnectorId | ConnectorId[] | null) {
  return attemptAsVisitor("connector-actions:setPreference", async () => {
    await questions.setPreference(await currentActor(), userId === null ? null : String(userId), kind, connector);
    done();
  });
}

/** What the recipient's answer where the Delivery reached them would do (demo only); nothing is saved. */
export async function simulateReply(deliveryId: number, text: string) {
  return attempt(async () => demo.simulateReply(await currentActor(), Number(deliveryId), String(text ?? "")));
}

/** Records the recipient's answer where the Delivery reached them (demo only, where visitors may change it, spec 0051): in the
 * Thread, as the real Connector does. Nothing is sent. The text goes through the text rules first. */
export async function recordSimulatedReply(deliveryId: number, text: string) {
  return attempt(() => inDemoVisit("connector-actions:recordSimulatedReply", async (visiting) => {
    const r = await demo.recordSimulatedReply(await currentActor(), Number(deliveryId), demoTextForVisit(visiting, String(text ?? ""), "message"));
    done();
    return r;
  }));
}

/** Closes the ticket as the ticket system would (demo only, where visitors may change it, spec 0051). */
export async function recordSimulatedTicketClose(deliveryId: number) {
  return attempt(() => inDemoVisit("connector-actions:recordSimulatedTicketClose", async () => {
    const r = await demo.recordSimulatedTicketClose(await currentActor(), Number(deliveryId));
    done();
    return r;
  }));
}

/** What closing the ticket would do (demo only); nothing is saved. */
export async function simulateTicketClose(deliveryId: number) {
  return attempt(async () => demo.simulateTicketClose(await currentActor(), Number(deliveryId)));
}

/** What a scheduler would do each morning: remind assignees of open tasks due within two days. */
export async function sendDueReminders() {
  // In the demo the reminders go to the Outbox, and one Workflow run a minute is all the demo takes (spec 0051).
  return attempt(() => inDemoVisit("connector-actions:sendDueReminders", async () => {
    const n = await questions.sendDueReminders(await currentActor());
    done();
    return n;
  }, { workflowRun: true }));
}

/** What a scheduler would do each period: ask every submitter whose value is missing. */
export async function askForMissingValues() {
  return attempt(() => inDemoVisit("connector-actions:askForMissingValues", async () => {
    const n = await questions.askForMissingValues(await currentActor());
    done();
    return n;
  }, { workflowRun: true }));
}

/** Records the submitter's answer to a Prompt where it reached them (demo only, where visitors may change it, spec 0051): through
 * intake, as the real Connector does. Nothing is sent. The text goes through the text rules first. */
export async function recordSimulatedPromptAnswer(deliveryId: number, text: string) {
  return attempt(() => inDemoVisit("connector-actions:recordSimulatedPromptAnswer", async (visiting) => {
    const r = await demo.recordSimulatedPromptAnswer(await currentActor(), Number(deliveryId), demoTextForVisit(visiting, String(text ?? ""), "message"));
    done();
    return r;
  }));
}

/** What the submitter's answer to a Prompt where it reached them would do (demo only); nothing is saved. */
export async function simulatePromptAnswer(deliveryId: number, text: string) {
  return attempt(async () => demo.simulatePromptAnswer(await currentActor(), Number(deliveryId), String(text ?? "")));
}
