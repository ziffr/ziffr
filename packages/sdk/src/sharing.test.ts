// The SDK's sharing, Group and people calls send what the API takes (ticket #434), checked against a recording fetch.
import { describe, expect, it } from "vitest";
import { Ziffr } from "./index";

function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, ziffr: new Ziffr({ url: "http://ziffr.test", accessKey: "zk_test", fetch }) };
}

describe("sharing calls", () => {
  it("send the paths, methods and bodies of the API", async () => {
    const { calls, ziffr } = recorder();
    await ziffr.shares.who({ type: "metric", id: "cash" });
    await ziffr.shares.set({ type: "dashboard", id: 7 }, { group: 3 }, "editor");
    await ziffr.shares.set({ type: "metric", id: "cash" }, { person: "p1" }, null);
    await ziffr.shares.decide(5, true);
    await ziffr.groups.create("Finance");
    await ziffr.groups.rename(3, "Money");
    await ziffr.groups.addMember(3, "p1");
    await ziffr.groups.removeMember(3, "p1");
    await ziffr.groups.remove(3);
    await ziffr.people.addContact({ name: "Cleo", email: "cleo@contacts.test" });
    await ziffr.people.setRole("p1", "admin");
    await ziffr.people.remove("p1", { successor: "p2" });
    await ziffr.people.remove("c1");
    await ziffr.invitations.invite({ email: "a@invite.test", role: "member" });
    await ziffr.invitations.link("guest");
    await ziffr.invitations.revoke(4);
    await ziffr.invitations.resend(4);
    await ziffr.joinRequests.decide(2, false);
    expect(calls).toEqual([
      { method: "GET", path: "/api/v1/shares?type=metric&id=cash", body: undefined },
      { method: "POST", path: "/api/v1/shares", body: { type: "dashboard", id: 7, group: 3, role: "editor" } },
      { method: "POST", path: "/api/v1/shares", body: { type: "metric", id: "cash", person: "p1", role: null } },
      { method: "POST", path: "/api/v1/shares/requests/5", body: { grant: true } },
      { method: "POST", path: "/api/v1/groups", body: { name: "Finance" } },
      { method: "PATCH", path: "/api/v1/groups/3", body: { name: "Money" } },
      { method: "POST", path: "/api/v1/groups/3/members", body: { person: "p1" } },
      { method: "DELETE", path: "/api/v1/groups/3/members/p1", body: undefined },
      { method: "DELETE", path: "/api/v1/groups/3", body: undefined },
      { method: "POST", path: "/api/v1/people", body: { name: "Cleo", email: "cleo@contacts.test" } },
      { method: "PATCH", path: "/api/v1/people/p1", body: { role: "admin" } },
      { method: "DELETE", path: "/api/v1/people/p1?successor=p2", body: undefined },
      { method: "DELETE", path: "/api/v1/people/c1", body: undefined },
      { method: "POST", path: "/api/v1/invitations", body: { email: "a@invite.test", role: "member" } },
      { method: "POST", path: "/api/v1/invitations/links", body: { role: "guest" } },
      { method: "DELETE", path: "/api/v1/invitations/4", body: undefined },
      { method: "POST", path: "/api/v1/invitations/4/resend", body: undefined },
      { method: "POST", path: "/api/v1/join-requests/2", body: { approve: false } },
    ]);
  });
});
