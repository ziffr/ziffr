// @vitest-environment node
// Starting point (spec 0052, ticket 6; GLOSSARY: Setup Guide, Pack): the two choices, the ranked Packs with why they fit
// and what they bring, an installed Pack offering "Set up from this Pack", each thing said once.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("./actions", () => ({ chooseExplore: async () => ({}), setUpFromPackInGuide: async () => ({}), skipStep: async () => ({}) }));
vi.mock("@/app/pack-actions", () => ({ readIncludedPackFile: async () => ({}), installIncludedPackFile: async () => ({}) }));
vi.mock("@/app/pack-setup-actions", () => ({ packSetup: async () => ({}) }));
vi.mock("@/app/settings/packs/preview-view", () => ({ useOpenPackPreview: () => () => {} }));
import { StartingPoint, whatYouGet } from "./starting-point";
import type { RecommendedPack } from "@ziffr/core/included-packs";

const pack = (id: string, over: Partial<RecommendedPack> = {}): RecommendedPack => ({
  id, name: id.split("/")[1]!.toUpperCase(), summary: `The ${id} Pack.`, logo: null,
  brings: [{ kind: "metric", count: 13, names: ["MRR", "ARR", "New MRR", "Churn", "NRR"] }, { kind: "workflow", count: 2, names: ["A", "B"] }, { kind: "dashboard", count: 1, names: ["D"] }],
  because: [], suggested: false, installed: false, installId: null, needsOwner: false, ...over,
});
const packs = [
  pack("ziffr/one", { because: ["industry", "function"], suggested: true }), pack("ziffr/two", { because: ["function"], suggested: true }), pack("ziffr/three"),
  pack("ziffr/four"), pack("ziffr/five"),
];
const base = { packs, startingPoint: null, metrics: 0, firstMetric: null, canAnswerAbout: true, isOwner: true, viewer: "me", numberStyle: {} as never, following: "ways", ticked: false };
const html = (over: Partial<Parameters<typeof StartingPoint>[0]> = {}) => renderToStaticMarkup(<StartingPoint {...base} {...over} />);

describe("what a Pack brings", () => {
  it("says counts, the first names of the Metrics and an ellipsis when there are more", () => {
    expect(whatYouGet(packs[0]!.brings)).toEqual(["13 Metrics, e.g. MRR, ARR, New MRR", "2 Workflows", "1 Dashboard"]);
    expect(whatYouGet([{ kind: "metric", count: 2, names: ["A", "B"] }])).toEqual(["2 Metrics, e.g. A, B"]);
    expect(whatYouGet([{ kind: "metric", count: 1, names: ["A"] }, { kind: "view", count: 1, names: ["V"] }])).toEqual(["1 Metric, e.g. A", "1 View Design"]);
  });
});

describe("the two choices", () => {
  const h = html();
  it("offers Explore on my own and Start from a Pack, one short sentence each", () => {
    expect(h).toContain("How do you want to start?");
    expect(h).toContain("Explore on my own");
    expect(h).toContain("Start from a Pack");
    expect(h).toContain("Pick or write your first Metric yourself.");
    expect(h).toContain("Get ready-made Metrics for your kind of work.");
    expect(html({ functionLabel: "Finance" })).toContain("Get ready-made Metrics for Finance.");
  });
  it("says nothing twice: no box before the choice and no paragraph explaining a Pack again", () => {
    expect(h).not.toContain("trial");
    expect(h).not.toContain("A Pack gives you");
    expect(h).not.toContain('role="status"');
  });
  it("shows the first three Packs ranked, each with its reason and what you get, and the rest behind See all", () => {
    expect(h).toContain("Packs suggested for you");
    expect(h).toContain("Suggested because of your industry and your function.");
    expect(h).toContain("Suggested because of your function.");
    expect(h.match(/What you get/g)).toHaveLength(3);
    expect(h).toContain("13 Metrics, e.g. MRR, ARR, New MRR");
    expect(h).toContain("See all 5 Packs");
    expect(h).not.toContain("FOUR");
    // Each shown Pack can be previewed and installed, by a click.
    expect(h.match(/>Preview</g)).toHaveLength(3);
    expect(h.match(/>Install</g)).toHaveLength(3);
  });
  it("without suggestions links to About you, only while answering it can still bring some", () => {
    const none = packs.map((p) => ({ ...p, because: [], suggested: false }));
    const h2 = html({ packs: none });
    expect(h2).toMatch(/<a[^>]*href="\/setup\?step=about"[^>]*>Answer About you to get suggestions<\/a>/);
    expect(h2).not.toContain("Suggested because");
    expect(html({ packs: none, canAnswerAbout: false })).not.toContain("to get suggestions");
    expect(h).not.toContain("to get suggestions");
  });
  it("offers Skip until the step is ticked, then Go on to the next step", () => {
    expect(html()).toContain(">Skip<");
    const ticked = html({ ticked: true, startingPoint: "scratch" });
    expect(ticked).toContain('href="/setup?step=ways"');
    expect(ticked).not.toContain(">Skip<");
  });
});

describe("installed Packs, Owners and Admins, and Metrics already there", () => {
  it("an installed Pack is not offered again and offers Set up from this Pack", () => {
    const h = html({ packs: [pack("ziffr/one", { installed: true, installId: 7, because: ["industry"] }), ...packs.slice(1)] });
    expect(h).toContain("Installed");
    expect(h).toContain("Set up from this Pack");
    expect(h.match(/>Install</g)).toHaveLength(2);
  });
  it("a Pack that holds a Theme is for an Owner: an Admin sees why and cannot press Install", () => {
    const themed = [pack("ziffr/one", { needsOwner: true }), ...packs.slice(1)];
    const admin = html({ packs: themed, isOwner: false });
    expect(admin).toContain("only an Owner can install this Pack");
    expect(admin).toMatch(/<button[^>]*disabled=""[^>]*>Install<\/button>/);
    expect(html({ packs: themed, isOwner: true })).not.toContain("only an Owner can install this Pack");
    expect(html({ packs: themed, isOwner: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Install<\/button>/);
  });
  it("a Workspace with Metrics already asks whether to start from a Pack anyway, and names the guide's first Metric", () => {
    expect(html({ metrics: 4 })).toContain("You have 4 Metrics. Start from a Pack anyway?");
    expect(html({ metrics: 1 })).toContain("You have 1 Metric. Start from a Pack anyway?");
    expect(html({ metrics: 4, startingPoint: "pack" })).not.toContain("Start from a Pack anyway?");
    expect(html({ firstMetric: { id: 3, name: "MRR" } })).toContain("Your first Metric:");
  });
});
