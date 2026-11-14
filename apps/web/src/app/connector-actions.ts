"use server";
// Connectors (GLOSSARY: Connector, Delivery, Delivery Preference): thin calls into the core. In the demo anyone may
// play the recipient on Slack, email, WhatsApp or a ticket system (@ziffr/core/demo-channels); elsewhere those refuse.
import * as optOut from "@ziffr/core/email-opt-out";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as questions from "@ziffr/core/questions";
import * as demo from "@ziffr/core/demo-channels";
import type { ConnectorId, PreferenceKind } from "@ziffr/core/connectors/index";

const done = () => revalidatePath("/", "layout");

/** A person sets their own preference; the team default (userId null) is set by owners and admins. */
/** The person gets Prompts and reminders by email again in this workspace, after stopping them (spec 0004). */
export async function emailRemindersAgain() {
  await optOut.optBackIn(await currentActor());
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
