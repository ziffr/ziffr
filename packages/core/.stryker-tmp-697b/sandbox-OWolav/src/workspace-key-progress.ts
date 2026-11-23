// @ts-nocheck
// How far the Workspace Keys' re-encryption is, for Installation Admins (spec 0028, ticket #247; GLOSSARY: Workspace
// Key, Installation Admin): per column how much is sealed, which key versions each Workspace has and whether any key
// is still wrapped under the previous Installation key. Never a key, wrapped or not, never a value or a row: counts,
// version numbers and the names Installation Admins already see in the Workspace Limits list.
import { db } from "./db";
import { assertInstallationAdmin, type InstallationActor } from "./installation-admins";
import { installationKeyFingerprint } from "./workspace-keys";
import { previousSecretsKey, secretsKey } from "./secrets";
import { DEMO_WORKSPACE_ID } from "./team";

/** The most Workspaces the page lists one by one (the ones still being worked on first). */
export const KEY_PROGRESS_LISTED = 50;

/** One sealed column, over every Workspace: values held, plain, under an older key version, would not open. */
export type ColumnProgress = { table: string; column: string; total: number; plain: number; oldVersion: number; unopenable: number; heldBack: number; workspacesDone: number; workspaces: number };

/** One Workspace: its key versions and how many sealed columns are checked off. */
export type WorkspaceKeyProgress = {
  workspaceId: string; name: string;
  versions: { version: number; current: boolean; pending: boolean; wrappedUnderPrevious: boolean }[];
  columnsDone: number; columns: number; plain: number; checkedAt: string | null;
};

/** What the Installation settings page shows of the encryption of Workspaces. */
export type KeyProgress = {
  /** False when the Installation has no ZIFFR_SECRETS_KEY: nothing is encrypted and the job waits. */
  encrypting: boolean;
  workspaces: number; keyed: number; finished: number;
  /** Workspace Keys wrapped under the previous Installation key (spec 0009), counted by their fingerprint. */
  keysUnderPreviousKey: number; hasPreviousKey: boolean;
  columns: ColumnProgress[];
  listed: WorkspaceKeyProgress[];
};

type Progress = { workspace_id: string; table_name: string; column_name: string; total: number; plain: number; old_version: number; unopenable: number; held_back: number; checked_at: string; done_at: string | null };
type KeyInfo = { workspace_id: string; version: number; retired_at: string | null; pending_until: string | null; wrapped_under: string | null };

/** Every row of a query, a thousand at a time (the API answers no more than that at once). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error("The progress could not be read.");
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

/** The progress of the re-encryption job, for an Installation Admin. */
export async function keyProgress(actor: InstallationActor): Promise<KeyProgress> {
  await assertInstallationAdmin(actor);
  const current = secretsKey();
  const fingerprint = current ? installationKeyFingerprint(current) : null;
  const ws = await all((a, b) => db().from("workspaces").select("id, name").neq("id", DEMO_WORKSPACE_ID).order("created_at").order("id").range(a, b));
  const workspaces = ws.map((w) => ({ id: String(w.id), name: String(w.name) }));
  // Only the columns the page needs: never `wrapped`, which holds a key in wrapped form.
  const keyRows = (await all((a, b) => db().from("workspace_keys").select("workspace_id, version, retired_at, pending_until, wrapped_under").order("workspace_id").order("version").range(a, b))) as KeyInfo[];
  const progress = (await all((a, b) => db().from("workspace_seal_progress").select("workspace_id, table_name, column_name, total, plain, old_version, unopenable, held_back, checked_at, done_at").order("workspace_id").order("table_name").order("column_name").range(a, b))) as Progress[];
  const underPrevious = (k: KeyInfo) => fingerprint !== null && k.wrapped_under !== fingerprint;

  const columns = new Map<string, ColumnProgress>();
  for (const p of progress) {
    const id = `${p.table_name}.${p.column_name}`;
    const c = columns.get(id) ?? { table: p.table_name, column: p.column_name, total: 0, plain: 0, oldVersion: 0, unopenable: 0, heldBack: 0, workspacesDone: 0, workspaces: 0 };
    c.total += Number(p.total); c.plain += Number(p.plain); c.oldVersion += Number(p.old_version); c.unopenable += Number(p.unopenable); c.heldBack += Number(p.held_back);
    c.workspaces += 1; if (p.done_at) c.workspacesDone += 1;
    columns.set(id, c);
  }

  const perWorkspace = new Map<string, Progress[]>();
  for (const p of progress) perWorkspace.set(p.workspace_id, [...(perWorkspace.get(p.workspace_id) ?? []), p]);
  const rows: WorkspaceKeyProgress[] = workspaces.map((w) => {
    const mine = perWorkspace.get(w.id) ?? [];
    return {
      workspaceId: w.id, name: w.name,
      versions: keyRows.filter((k) => k.workspace_id === w.id).sort((a, b) => a.version - b.version).map((k) => ({ version: k.version, current: k.retired_at === null && k.pending_until === null, pending: k.pending_until !== null, wrappedUnderPrevious: underPrevious(k) })),
      columnsDone: mine.filter((p) => p.done_at).length, columns: mine.length, plain: mine.reduce((s, p) => s + Number(p.plain), 0),
      checkedAt: mine.length ? mine.map((p) => p.checked_at).sort().at(-1) ?? null : null,
    };
  });
  const finished = (r: WorkspaceKeyProgress) => r.columns > 0 && r.columnsDone === r.columns;
  // The ones still being worked on, or holding a key under the previous Installation key, first.
  const attention = (r: WorkspaceKeyProgress) => (finished(r) && !r.versions.some((v) => v.wrappedUnderPrevious) ? 1 : 0);
  return {
    encrypting: current !== null,
    workspaces: workspaces.length,
    keyed: new Set(keyRows.map((k) => k.workspace_id)).size,
    finished: rows.filter(finished).length,
    keysUnderPreviousKey: keyRows.filter(underPrevious).length,
    hasPreviousKey: previousSecretsKey() !== null,
    columns: [...columns.values()],
    listed: rows.sort((a, b) => attention(a) - attention(b)).slice(0, KEY_PROGRESS_LISTED),
  };
}
