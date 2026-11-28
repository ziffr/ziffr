// Who a session becomes (spec 0071; GLOSSARY: Deleted person): a sign-in that outlived its person is nobody's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personFor, sessionUser, signedIn } from "./auth";

const state = vi.hoisted(() => ({ linked: null as { personId: string; erased: boolean } | null }));
vi.mock("server-only", () => ({}));
// A signed-in browser: its session cookie, which the sign-in service (below) confirms.
vi.mock("next/headers", () => ({ cookies: async () => {
  const session = JSON.stringify({ access_token: "token", refresh_token: "refresh", token_type: "bearer", expires_at: 4_000_000_000, user: { id: "account-1" } });
  return { getAll: () => [{ name: "sb-localhost-auth-token", value: session }], get: () => undefined, set: () => {} };
} }));
vi.mock("./demo-mode", () => ({ demoEnabled: async () => false, demoOnly: () => false }));
vi.mock("./auth-settings", () => ({ authSettings: () => ({ url: "http://localhost", anonKey: "x" }) }));
// Any other read or write of the database fails the test: nothing may be claimed or created for a Deleted person.
vi.mock("./db", () => ({ db: { from: () => { throw new Error("No database in this test."); } } }));
vi.mock("@ziffr/core/erase-person", () => ({ linkedPerson: async () => state.linked }));

describe("a session of a Deleted person", () => {
  beforeEach(() => {
    state.linked = { personId: "ben", erased: true };
    vi.stubGlobal("fetch", async () => Response.json({ id: "account-1" }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is signed out", async () => {
    expect(await sessionUser()).toBeNull();
    expect(await signedIn()).toBeNull();
  });

  it("becomes no person", async () => {
    await expect(personFor({ id: "account-1" })).rejects.toThrow("deleted");
  });

  it("differs from a person who is not erased", async () => {
    state.linked = { personId: "ben", erased: false };
    expect(await sessionUser()).toMatchObject({ id: "account-1" });
    expect(await personFor({ id: "account-1" })).toBe("ben");
  });
});
