"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { share as coreShare, shareWithGroup as coreShareWithGroup } from "@ziffr/core/sharing";
import * as dash from "@ziffr/core/dashboards";
import * as questions from "@ziffr/core/questions";
import type { DropSource } from "@ziffr/core/dashboards";
import type { ConnectorId } from "@ziffr/core/connectors/index";
import type { ActionKind, ShareRole, TemplateId, WidgetSettings } from "@ziffr/core/types";

// Every lookup by an id from the browser is limited to the acting person's workspace, and every record created
// here lands in it (rows that belong to a dashboard or Metric take its workspace in the database).

const done = () => revalidatePath("/", "layout");

export type { DropSource } from "@ziffr/core/dashboards";

/** Drops something onto a dashboard: always an independent copy (GLOSSARY: Widget). */
export async function placeWidget(dashboardId: number, source: DropSource, pos?: { x: number; y: number }) {
  await dash.placeWidget(await currentActor(), Number(dashboardId), source, pos);
  done();
}

/** Saves where the widgets of a dashboard sit and how large they are. */
export async function saveLayout(dashboardId: number, items: { i: string; x: number; y: number; w: number; h: number }[]) {
  await dash.saveLayout(await currentActor(), Number(dashboardId), items);
}

/** Changes a widget's template, settings, title or Metrics. */
export async function updateWidget(id: number, patch: { template?: TemplateId; settings?: WidgetSettings; title?: string | null; metricIds?: number[] }) {
  await dash.updateWidget(await currentActor(), Number(id), patch ?? {});
  done();
}

/** Change visualization to a team template: the widget becomes the template, filled with these metrics. */
export async function applyTemplate(id: number, templateId: number, fills: number[][]) {
  await dash.applyTemplate(await currentActor(), Number(id), Number(templateId), fills);
  done();
}

/** Removes a widget. */
export async function removeWidget(id: number) {
  await dash.removeWidget(await currentActor(), Number(id));
  done();
}

/** Save a copy of a widget (or an analysis result) into the viewer's Pool. */
export async function saveToPool(source: DropSource, title: string) {
  await dash.saveToPool(await currentActor(), source, String(title ?? ""));
  done();
}

/** Deletes one of the viewer's saved widgets. */
export async function deleteSavedWidget(id: number) {
  await dash.deleteSavedWidget(await currentActor(), Number(id));
  done();
}

/** Creates a dashboard. */
export async function createDashboardNamed(name: string) {
  const id = await dash.createDashboard(await currentActor(), String(name ?? ""));
  done();
  return id;
}

/** Shares something the viewer owns with a member, or takes the Share away; the core decides who may. */
export async function setShare(objectType: "metric" | "dashboard" | "deck", objectId: number, userId: string, role: ShareRole | null) {
  await coreShare(await currentActor(), objectType, Number(objectId), String(userId), role);
  done();
}

/** Shares with a Group: everyone in it, now and later (GLOSSARY: Group). */
export async function setGroupShare(objectType: "metric" | "dashboard" | "deck", objectId: number, groupId: number, role: ShareRole | null) {
  await coreShareWithGroup(await currentActor(), objectType, Number(objectId), Number(groupId), role);
  done();
}

// Analysis Canvas: one scratch canvas per user.
/** Adds Metrics to the viewer's Analysis Canvas. */
export async function canvasAdd(metricIds: number[]) {
  await dash.canvasAdd(await currentActor(), metricIds);
  done();
}

/** Takes a Metric off the viewer's Analysis Canvas. */
export async function canvasRemove(metricId: number) {
  await dash.canvasRemove(await currentActor(), Number(metricId));
  done();
}

/** Sets the Metrics on the viewer's Analysis Canvas. */
export async function canvasSet(metricIds: number[]) {
  await dash.canvasSet(await currentActor(), metricIds);
  done();
}

/** History popover: every Observation plus Actions for one metric. */
export async function getHistory(metricId: number) {
  return dash.metricHistory(await currentActor(), Number(metricId));
}

/** Ask a Question or assign a Task right where the viewer is. */
export async function assignInPlace(input: { metricId: number; period: string; assigneeId: string; kind: ActionKind; text: string; due?: string | null; breakdownLabel?: string | null; via?: ConnectorId | null; readGroupId?: number | null }) {
  const id = await questions.ask(await currentActor(), input);
  done();
  return id;
}

/** The assignee marks their task done. */
export async function markTaskDone(actionId: number) {
  await questions.markTaskDone(await currentActor(), Number(actionId));
  done();
}
