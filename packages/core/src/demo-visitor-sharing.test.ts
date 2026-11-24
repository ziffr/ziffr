// What a Share may show in the demo and the demo's own words for a database refusal (spec 0051, ticket 11), without a database.
import { describe, expect, it } from "vitest";
import { DemoLimit, DemoSeededWords, DemoShowcase } from "./demo";
import { demoRefusalOf, visitorGroupPeople, visitorJoinShowsOnlySeen, visitorShowsOnlySeen } from "./demo-visitor-sharing";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };

describe("demoRefusalOf", () => {
  it("says the demo's sentence for the seed's words, the showcase and a full cap, and nothing for any other error", () => {
    expect(demoRefusalOf({ code: "ZF4D3", message: "demo_showcase" })).toBeInstanceOf(DemoShowcase);
    expect(demoRefusalOf({ code: "ZF4D4", message: "demo_words" })).toBeInstanceOf(DemoSeededWords);
    expect(demoRefusalOf({ code: "ZF4D2", message: "demo_limit:tags" })).toEqual(new DemoLimit("tags"));
    expect(demoRefusalOf({ code: "23505", message: "duplicate" })).toBeNull();
    expect(demoRefusalOf(null)).toBeNull();
  });
});

describe("outside a demo visit", () => {
  it("the checks of what a Share shows do nothing (and read nothing)", async () => {
    await visitorShowsOnlySeen(demo, "dashboard", 1, ["greta"]);
    await visitorJoinShowsOnlySeen(demo, 1, "greta");
    expect(await visitorGroupPeople(demo, 1)).toEqual([]);
  });
});
