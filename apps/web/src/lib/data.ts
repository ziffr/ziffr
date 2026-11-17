import "server-only";
// Data of the current Workspace (GLOSSARY: Metric, Observation, Action). The loaders live in the core
// (@ziffr/core/workspace-data) and take the workspace; these pass in the one the person is working in. The ones a
// page and its layout often both call read once per request (React cache; it does not cache outside a render).
import { cache } from "react";
import { currentWorkspaceId } from "./viewer";
import * as data from "@ziffr/core/workspace-data";
import { peopleIn } from "@ziffr/core/submissions";
import { yearStartOf } from "@ziffr/core/fiscal-year";
import type { Metric, Profile } from "@ziffr/core/types";

/** The people of a Workspace, members then Contacts; it lives in the core (see peopleIn there). */
export const getPeopleIn = peopleIn;
/** A Metric with numeric targets; it lives in the core. */
export { normalizeMetric } from "@ziffr/core/metric-row";
/** Plotted series per metric slug; pure, in the core. */
export const buildSeries = data.buildSeries;

/** The people in the current Workspace: members, then Contacts (flagged). Pickers for sharing or asking leave the
 * Contacts out: they have no login and only submit values. */
export const getProfiles = cache(async (): Promise<Profile[]> => {
  return peopleIn(await currentWorkspaceId());
});

/** The people of the current workspace by id. */
export async function getProfileMap() {
  return Object.fromEntries((await getProfiles()).map((p) => [p.id, p])) as Record<string, Profile>;
}

/** The month the current workspace's year starts in (GLOSSARY: Fiscal Year): pass it to every period name and Comparison. */
export const getYearStart = cache(async () => yearStartOf(await currentWorkspaceId()));

/** The current workspace's Metrics. */
export const getMetrics = cache(async () => data.getMetrics(await currentWorkspaceId()));
/** Every value of the current workspace, optionally of some Metrics only. */
export const getObservations = async (metricIds?: number[]) => data.getObservations(await currentWorkspaceId(), metricIds);
/** One value of the current workspace by id. */
export const getObservation = async (id: number | null | undefined) => data.getObservation(await currentWorkspaceId(), id);
/** The last values of one Metric of the current workspace, oldest first. */
export const getLastValues = async (metricId: number, n: number) => data.getLastValues(await currentWorkspaceId(), metricId, n);
/** The current workspace's Metrics and series; with `points`, only each series' last periods. */
export const getAllSeries = (opts?: { points?: number }) => allSeries(opts?.points ?? 0);
const allSeries = cache(async (points: number) => data.getAllSeries(await currentWorkspaceId(), points ? { points } : {}));
/** The series of some Metrics of the current workspace (with the inputs of Derived ones). */
export const getSeriesOf = async (metrics: Metric[], ids: number[]) => data.getSeriesOf(await currentWorkspaceId(), metrics, ids);
/** The current workspace's Actions. */
export const getActions = async (filter?: { metricId?: number }) => data.getActions(await currentWorkspaceId(), filter);
/** How many Actions wait for the person in the current workspace. */
export const openActionCount = cache(async (viewer: string) => data.openActionCount(await currentWorkspaceId(), viewer));
/** Target Series and Projections of the current workspace. */
export const getSeriesValues = async (metricIds: number[]) => data.getSeriesValues(await currentWorkspaceId(), metricIds);
/** Breakdowns of the current workspace. */
export const getBreakdowns = async (metricIds: number[]) => data.getBreakdowns(await currentWorkspaceId(), metricIds);
