"use server";
// Connectors (GLOSSARY: Connector, Delivery, Delivery Preference): thin calls into the core. In the demo anyone may
// play the recipient on Slack, email, WhatsApp or a ticket system (@ziffr/core/demo-channels); elsewhere those refuse.
import * as optOut from "@ziffr/core/email-opt-out";
import * as slackConnection from "@ziffr/core/slack-connection";
import * as slackPeople from "@ziffr/core/slack-people";
import * as telegramConnection from "@ziffr/core/telegram-connection";
import * as telegramPeople from "@ziffr/core/telegram-people";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import * as questions from "@ziffr/core/questions";
import * as demo from "@ziffr/core/demo-channels";
import type { ConnectorId, PreferenceKind } from "@ziffr/core/connectors/index";

const done = () => revalidatePath("/", "layout");

/** Turns Telegram on or off for the workspace (spec 0016; Owners and Admins, the core checks). */
export async function setTelegram(on: boolean) {
  await telegramConnection.setTelegramEnabled(await currentActor(), on);
  done();
}

/** "Connect Telegram" (spec 0016): a one-time link that opens the bot; only the link goes back. */
export async function telegramLinkStart() {
  return telegramPeople.startTelegramLink(await currentActor());
}

/** "Connect Telegram" on a personal form page: for the person whose form it is; the form code is the credential. */
export async function telegramFormLinkStart(formCode: string) {
  return telegramPeople.startTelegramLinkByForm(String(formCode));
}

/** The person gets Prompts and reminders on Telegram again in this workspace, after stopping them (spec 0016). */
export async function telegramRemindersAgain() {
  await telegramPeople.telegramOptBackIn(await currentActor());
  done();
}

/** The person forgets their Telegram link in this workspace. */
export async function telegramUnlink() {
  await telegramPeople.unlinkTelegram(await currentActor());
  done();
}

/** A person sets their own preference; the team default (userId null) is set by owners and admins. */
/** The person gets Prompts and reminders by email again in this workspace, after stopping them (spec 0004). */
export async function emailRemindersAgain() {
  await optOut.optBackIn(await currentActor());
  revalidatePath("/connectors");
}

/** "Add to Slack" (spec 0007): an Owner or Admin is sent to Slack with a one-time state; the core checks the role. */
export async function connectSlack() {
  redirect(await slackConnection.startSlackInstall(await currentActor()));
}

/** Disconnects the workspace's Slack (Owners and Admins; the core checks). */
export async function disconnectSlack() {
  await slackConnection.disconnectSlack(await currentActor());
  revalidatePath("/connectors");
}

/** A one-time code the person sends the Ziffr app on Slack to link their Slack account. Only the code goes back. */
export async function slackLinkCode() {
  return slackPeople.startSlackLink(await currentActor());
}

/** The person gets Prompts and reminders on Slack again in this workspace, after stopping them (spec 0007). */
export async function slackRemindersAgain() {
  await slackPeople.slackOptBackIn(await currentActor());
  revalidatePath("/connectors");
}

/** The person forgets their link to Slack in this workspace. */
export async function unlinkSlack() {
  await slackPeople.unlinkSlack(await currentActor());
  revalidatePath("/connectors");
}

/** Sets a Delivery Preference. */
export async function setPreference(userId: string | null, kind: PreferenceKind, connector: ConnectorId | null) {
  await questions.setPreference(await currentActor(), userId === null ? null : String(userId), kind, connector);
  done();
}

/** The recipient answers where the Delivery reached them (demo only). */
export async function simulateReply(deliveryId: number, text: string) {
  await demo.simulateReply(await currentActor(), Number(deliveryId), String(text ?? ""));
  done();
}

/** Closing the ticket marks the task done (demo only). */
export async function simulateTicketClose(deliveryId: number) {
  await demo.simulateTicketClose(await currentActor(), Number(deliveryId));
  done();
}

/** What a scheduler would do each morning: remind assignees of open tasks due within two days. */
export async function sendDueReminders() {
  const n = await questions.sendDueReminders(await currentActor());
  done();
  return n;
}

/** What a scheduler would do each period: ask every submitter whose value is missing. */
export async function askForMissingValues() {
  const n = await questions.askForMissingValues(await currentActor());
  done();
  return n;
}

/** The submitter answers a Prompt where it reached them (demo only). */
export async function simulatePromptAnswer(deliveryId: number, text: string) {
  const r = await demo.simulatePromptAnswer(await currentActor(), Number(deliveryId), String(text ?? ""));
  done();
  return r;
}
