import "server-only";
// Data of the current Workspace (GLOSSARY: Metric, Observation, Action). The loaders live in the core
// (@ziffr/core/workspace-data) and take the workspace; these pass in the one the person is working in.
import { currentWorkspaceId } from "./viewer";
import * as data from "@ziffr/core/workspace-data";
import { peopleIn } from "@ziffr/core/submissions";
import type { Observation, Profile } from "@ziffr/core/types";

/** The people of a Workspace, members then Contacts; it lives in the core (see peopleIn there). */
export const getPeopleIn = peopleIn;
/** A Metric with numeric targets; it lives in the core. */
export { normalizeMetric } from "@ziffr/core/metric-row";
/** Plotted series per metric slug; pure, in the core. */
export const buildSeries = data.buildSeries;

/** The people in the current Workspace: members, then Contacts (flagged). Pickers for sharing or asking leave the
 * Contacts out: they have no login and only submit values. */
export async function getProfiles(): Promise<Profile[]> {
  return peopleIn(await currentWorkspaceId());
}

/** The people of the current workspace by id. */
export async function getProfileMap() {
  return Object.fromEntries((await getProfiles()).map((p) => [p.id, p])) as Record<string, Profile>;
}

/** The current workspace's Metrics. */
export const getMetrics = async () => data.getMetrics(await currentWorkspaceId());
/** The current workspace's values, optionally of some Metrics only. */
export const getObservations = async (metricIds?: number[]) => data.getObservations(await currentWorkspaceId(), metricIds);
/** The current workspace's Metrics, values and series. */
export const getAllSeries = async () => data.getAllSeries(await currentWorkspaceId());
/** The current workspace's Actions. */
export const getActions = async (filter?: { metricId?: number }) => data.getActions(await currentWorkspaceId(), filter);
/** How many Actions wait for the person in the current workspace. */
export const openActionCount = async (viewer: string) => data.openActionCount(await currentWorkspaceId(), viewer);
/** Target Series and Projections of the current workspace. */
export const getSeriesValues = async (metricIds: number[]) => data.getSeriesValues(await currentWorkspaceId(), metricIds);
/** Breakdowns of the current workspace. */
export const getBreakdowns = async (metricIds: number[], observations: Observation[]) => data.getBreakdowns(await currentWorkspaceId(), metricIds, observations);
