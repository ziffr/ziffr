import "server-only";
// Who sees what in the current Workspace (GLOSSARY: Share, Viewer, Editor, Group, Token, Thread). The loaders and
// rules live in the core (@ziffr/core/access, @ziffr/core/visibility); these pass in the workspace being worked in.
import { currentWorkspaceId } from "./viewer";
import { cache } from "react";
import * as access from "@ziffr/core/access";
import type { Metric } from "@ziffr/core/types";

export type { DashboardAccess, ObjectType } from "@ziffr/core/access";
/** Every Metric drawn on a deck; pure, in the core. */
export { deckMetricIds } from "@ziffr/core/visibility";

// Read-only loaders a page and its parts often call more than once read once per request (React cache, which does not
// cache outside a render, so a server action always reads afresh).
const ws = () => currentWorkspaceId();
/** The current workspace's Groups with their members. */
export const getGroups = cache(async () => access.getGroups(await ws()));
/** Shares as stored, for the Share dialog. */
export const getRawShares = cache(async () => access.getRawShares(await ws()));
/** Shares per person, Groups expanded. */
const getShares = cache(async () => access.getShares(await ws()));
/** The Actions this viewer may read. */
export const readableActions = async (viewer: string, filter?: { metricId?: number }) => access.readableActions(await ws(), viewer, filter);
/** Dashboards the viewer owns or that were shared with them. */
export const visibleDashboards = cache(async (viewer: string) => access.visibleDashboards(await ws(), viewer, await getShares()));
/** Decks the viewer owns or that were shared with them. */
export const visibleDecks = cache(async (viewer: string) => access.visibleDecks(await ws(), viewer, await getShares()));
/** The Metrics the viewer sees. */
export const visibleMetricIds = async (viewer: string, metrics: Metric[]) => access.visibleMetricIds(await ws(), viewer, metrics);
/** Everything a canvas draws from, with the series of the Metrics in `seriesOf` (all visible ones without it). */
export const getCanvasData = async (viewer: string, seriesOf?: access.SeriesOf) => access.getCanvasData(await ws(), viewer, { seriesOf });
/** What sharing these Metrics would show each person or Group that they cannot see on their own. */
export const revealedBy = async (metricIds: number[], ownerId: string) => access.revealedBy(await ws(), metricIds, ownerId);
