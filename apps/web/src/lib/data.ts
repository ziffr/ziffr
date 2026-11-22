import "server-only";
// Data of the current Workspace (GLOSSARY: Metric, Observation, Action). The loaders live in the core
// (@ziffr/core/workspace-data) and take the workspace; these pass in the one the person is working in. The ones a
// page and its layout often both call read once per request (React cache; it does not cache outside a render).
import { cache } from "react";
import { currentActor, currentWorkspaceId } from "./viewer";
import { schedule } from "@ziffr/core/schedule";
import { toCloseCount } from "@ziffr/core/actions-overview";
import * as data from "@ziffr/core/workspace-data";
import { peopleIn } from "@ziffr/core/submissions";
import { peopleFor } from "@ziffr/core/access";
import { yearStartOf } from "@ziffr/core/fiscal-year";
import { attainmentMethodOf, numberStyleOf } from "@ziffr/core/workspace-settings";
import type { Profile } from "@ziffr/core/types";

/** The people of a Workspace, members then Contacts; it lives in the core (see peopleIn there). */
export const getPeopleIn = peopleIn;

/** The people of the current Workspace the person may be shown (the core's peopleFor): members, then Contacts
 * (flagged); for a Guest only themselves. Pickers for sharing or asking leave the
 * Contacts out: they have no login and only submit values. */
export const getProfiles = cache(async (): Promise<Profile[]> => {
  return peopleFor(await currentActor());
});

/** The people of the current workspace by id. */
export async function getProfileMap() {
  return Object.fromEntries((await getProfiles()).map((p) => [p.id, p])) as Record<string, Profile>;
}

/** The month the current workspace's year starts in (GLOSSARY: Fiscal Year): pass it to every period name and Comparison. */
export const getYearStart = cache(async () => yearStartOf(await currentWorkspaceId()));

/** How the current workspace writes numbers (GLOSSARY: Number Style): pass it to everything that reads or writes one. */
export const getNumberStyle = cache(async () => numberStyleOf(await currentWorkspaceId()));

/** How the current workspace computes Attainment for Metrics without a method of their own (GLOSSARY: Attainment). */
export const getAttainmentMethod = cache(async () => attainmentMethodOf(await currentWorkspaceId()));

/** The current workspace's Metrics. */
export const getMetrics = cache(async () => data.getMetrics(await currentWorkspaceId()));
/** The last values of one Metric of the current workspace, oldest first. */
export const getLastValues = async (metricId: number, n: number) => data.getLastValues(await currentWorkspaceId(), metricId, n);
/** The current workspace's Metrics and series; with `points`, only each series' last periods. */
export const getAllSeries = (opts?: { points?: number }) => allSeries(opts?.points ?? 0);
const allSeries = cache(async (points: number) => data.getAllSeries(await currentWorkspaceId(), points ? { points } : {}));
/** How many Actions wait for the person in the current workspace. */
export const openActionCount = cache(async (viewer: string) => data.openActionCount(await currentWorkspaceId(), viewer));
/** Target Series and Projections of the current workspace. */
export const getSeriesValues = async (metricIds: number[]) => data.getSeriesValues(await currentWorkspaceId(), metricIds);
/** Breakdowns of the current workspace. */
export const getBreakdowns = async (metricIds: number[]) => data.getBreakdowns(await currentWorkspaceId(), metricIds);

/** How many values are due from the viewer, their overdue ones and those due today, and the Actions they have to close (GLOSSARY: Schedule, Due Date), for
 * the sidebar's Schedule row. A number only; where the Schedule cannot be read it is 0, never an error on every page. */
export const dueValueCount = cache(async (): Promise<number> => {
  try {
    const actor = await currentActor();
    const s = await schedule(actor);
    const today = s.days.find((d) => d.date === s.today)?.entries ?? [];
    // Answered Actions waiting for the person to close them count too (the Schedule's To close).
    return [...s.overdue, ...today].filter((e) => e.kind === "value_due").length + (await toCloseCount(actor));
  } catch {
    return 0;
  }
});
