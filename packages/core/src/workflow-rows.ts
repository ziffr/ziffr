// Workflow rows (GLOSSARY: Workflow; spec 0028, ticket #248): reading and writing `workflows.config` with its sealed
// numbers. Every reader of the config goes through here, so what the engine, Tell, the API and the Versions see is
// always the opened config; every writer seals it for the Workflow it belongs to.
import { openConfig, sealConfig } from "./sealed-workflow";
import { workspaceCipher } from "./workspace-keys";

type Row = { id?: unknown; config?: unknown };

/** Workflow rows with their config opened (the rows need their id); rows without a config pass as they are. */
export async function openWorkflowRows<T extends Row>(workspaceId: string, rows: T[] | null | undefined): Promise<T[]> {
  if (!rows?.length) return rows ?? [];
  const cipher = await workspaceCipher(workspaceId);
  return rows.map((r) => (r.config === undefined || r.config === null || r.id === undefined || r.id === null ? r : { ...r, config: openConfig(cipher, Number(r.id), r.config) }));
}

/** One Workflow row with its config opened; null stays null. */
export async function openWorkflowRow<T extends Row>(workspaceId: string, row: T | null | undefined): Promise<T | null> {
  return row ? (await openWorkflowRows(workspaceId, [row]))[0] : null;
}

/** A config sealed to store for the Workflow with this id; as it is where nothing is sealed. */
export async function sealedWorkflowConfig<T>(workspaceId: string, id: number, config: T): Promise<T> {
  return sealConfig(await workspaceCipher(workspaceId), id, config);
}
