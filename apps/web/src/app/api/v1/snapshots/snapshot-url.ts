// A Snapshot's link made absolute for this server, instead of its path (ticket #435).
import type { ApiSnapshot, ApiSnapshotSummary } from "@ziffr/core/api-snapshots";

/** The Snapshot with `url` for this server in place of `path`. */
export function snapshotWithUrl<T extends ApiSnapshotSummary | ApiSnapshot>(req: Request, s: T): Omit<T, "path"> & { url: string } {
  const { path, ...rest } = s;
  return { ...rest, url: new URL(path, req.url).toString() };
}
