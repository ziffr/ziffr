// The Metrics offered on Connectors → Send values: only what the person sees, only what takes values from a program, and
// nothing for a Guest (spec 0043, ticket 8).
import { afterEach, describe, expect, it } from "vitest";
import { sendableMetrics } from "./send-values-options";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe("sendableMetrics", () => {
  it("offers an Owner the visible Metrics that take values from the API, not Derived, Archived or API-less ones", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const plain = await w.metric(sara, { name: "Plain" });
    await w.metric(sara, { name: "Computed", formula: `{${plain.slug}} * 2` });
    const old = await w.metric(sara, { name: "Old" });
    await import("./db").then(({ db }) => db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", old.id));
    await w.metric(sara, { name: "Form only", sources: ["web_form"] });
    const got = await sendableMetrics(w.actor(sara));
    expect(got.feed).toEqual([{ slug: plain.slug, name: "Plain" }]);
    expect(got.person).toEqual([]);
  });

  it("never offers a Member a Metric they do not see, and offers a Member's own key only the Metrics they submit to", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const ben = await w.person("member");
    const hidden = await w.metric(sara, { name: "Salaries" });          // Sara's, shared with nobody
    const mine = await w.metric(ben, { name: "Ben's visits" });          // Ben's own
    const seenNotSubmitted = await w.metric(ben, { name: "Ben's other" });
    await w.token(mine.id, ben);
    const got = await sendableMetrics(w.actor(ben, "member"));
    expect(got.feed).toEqual([]);                                        // a Feed Key is for Owners and Admins
    expect(got.person).toEqual([{ slug: mine.slug, name: "Ben's visits" }]);
    expect(JSON.stringify(got)).not.toMatch(new RegExp(`${hidden.slug}|Salaries|${seenNotSubmitted.slug}`));
  });

  it("offers a Guest nothing", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const gus = await w.person("guest");
    const m = await w.metric(sara, { name: "Plain" });
    await w.token(m.id, gus);
    expect(await sendableMetrics(w.actor(gus, "guest"))).toEqual({ feed: [], person: [] });
  });
});
