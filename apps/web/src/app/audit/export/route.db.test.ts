// GET /audit/export over HTTP (spec 0008): a CSV download for Owners and Admins only, never cached, with the page's
// filter. What goes into the file is proven in the core's audit-log.db.test.ts; here the door and the headers.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@ziffr/core/actor";
import { createGroup } from "@ziffr/core/team";
import { auditLog } from "@ziffr/core/audit-log";
import { workspace } from "@ziffr/core/test/db-fixtures";

// The signed-in person stands in: sessions are proven in sign-in's own tests.
const acting: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/viewer", () => ({ currentActor: async () => acting.actor }));
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const call = (query = "") => GET(new Request(`http://ziffr.test/audit/export${query}`));

describe("GET /audit/export", () => {
  it("answers 404 to Members and Guests", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member"); const gus = await w.person("guest");
    for (const actor of [w.actor(ben, "member"), w.actor(gus, "guest")]) {
      acting.actor = actor;
      const res = await call();
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("streams the filtered log as a CSV download that is never cached, and records the export", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ada = await w.person("admin");
    await createGroup(w.actor(sara), "Sales");
    acting.actor = w.actor(ada, "admin");
    const res = await call("?kind=group&from=nonsense");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store, private");
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"group.created"');
    expect((await auditLog(w.actor(sara))).events[0]).toMatchObject({ kind: "export.audit_log", actorId: ada, details: { kind: "group" } });
  });
});
