import "server-only";
// Who sees what in the current Workspace (GLOSSARY: Share, Viewer, Editor, Group, Token, Thread). The loaders and
// rules live in the core (@ziffr/core/access, @ziffr/core/visibility); these pass in the workspace being worked in.
import { currentWorkspaceId } from "./viewer";
import * as access from "@ziffr/core/access";
import type { Metric } from "@ziffr/core/types";

export type { DashboardAccess, DeckAccess, ObjectType, Audience } from "@ziffr/core/access";
/** Who may read a Thread; pure, in the core. */
export const threadReader = access.threadReader;
/** Every Metric drawn on a deck; pure, in the core. */
export { deckMetricIds } from "@ziffr/core/visibility";

const ws = () => currentWorkspaceId();
/** The current workspace's Groups with their members. */
export const getGroups = async () => access.getGroups(await ws());
/** Shares as stored, for the Share dialog. */
export const getRawShares = async () => access.getRawShares(await ws());
/** Shares per person, Groups expanded. */
export const getShares = async () => access.getShares(await ws());
/** The Actions this viewer may read. */
export const readableActions = async (viewer: string, filter?: { metricId?: number }) => access.readableActions(await ws(), viewer, filter);
/** Dashboards the viewer owns or that were shared with them. */
export const visibleDashboards = async (viewer: string) => access.visibleDashboards(await ws(), viewer);
/** Decks the viewer owns or that were shared with them. */
export const visibleDecks = async (viewer: string) => access.visibleDecks(await ws(), viewer);
/** The Metrics the viewer sees. */
export const visibleMetricIds = async (viewer: string, metrics: Metric[]) => access.visibleMetricIds(await ws(), viewer, metrics);
/** Everything a canvas draws from. */
export const getCanvasData = async (viewer: string) => access.getCanvasData(await ws(), viewer);
/** What sharing these Metrics would show each person or Group that they cannot see on their own. */
export const revealedBy = async (metricIds: number[], ownerId: string) => access.revealedBy(await ws(), metricIds, ownerId);
/** Everyone who can see something, and why. */
export const audience = async (type: access.ObjectType, id: number, viewer: string) => access.audience(await ws(), type, id, viewer);
