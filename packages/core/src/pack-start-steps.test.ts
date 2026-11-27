import { describe, expect, it } from "vitest";
import { bundledPacks } from "./included-packs";
import { installManifest, storedItems } from "./packs";
import { declarationsFrom, type DeclaredEntry, type DeclaredTemplate } from "./pack-start-declarations";
import { defaultChoices, startSteps, type StartRoom, type StartStep } from "./pack-start-steps";
import { planStart } from "./pack-start-plan";

const UNLIMITED: StartRoom = { metrics: null, trial: null, practice: false };
const TRIAL: StartRoom = { metrics: 25, trial: { metricCap: 25, places: 4, others: 0 }, practice: false };

/** What installing one of Ziffr's own Packs would keep, with the manifest changed where a test says. */
function stored(id: string, change: (manifest: Record<string, unknown>) => Record<string, unknown> = (m) => m) {
  const { pack } = bundledPacks().get(`ziffr/${id}`)!;
  const items = storedItems(pack);
  const entries = items.catalog.map((e): DeclaredEntry => ({ pack_key: e.key, name: e.name, period: e.period, formula: e.formula, total: "total" in e ? e.total : null }));
  const templates = items.templates.map((t) => ({ kind: t.kind, pack_key: t.key, name: t.name, slots: t.slots, body: t.body }) as DeclaredTemplate);
  return declarationsFrom(change(JSON.parse(JSON.stringify(installManifest(pack, items))) as Record<string, unknown>), entries, templates);
}

const kinds = (steps: StartStep[]) => steps.map((s) => s.step);
const step = <K extends StartStep["step"]>(steps: StartStep[], kind: K) => steps.find((s): s is Extract<StartStep, { step: K }> => s.step === kind)!;

describe("the steps of every Pack Ziffr ships", () => {
  const ids = [...bundledPacks().keys()].map((id) => id.replace("ziffr/", ""));

  it.each(ids)("%s previews, asks and checks, and its preselected answers can be set up", (id) => {
    const d = stored(id);
    const steps = startSteps(d, UNLIMITED);
    expect(kinds(steps)[0]).toBe("preview");
    expect(kinds(steps).at(-1)).toBe("check");
    const preview = step(steps, "preview");
    expect(preview.setsUp).toBe(true);
    expect(preview.blocked).toBeNull();
    expect(preview.draws?.kind).toBe(id === "board-meeting" ? "deck" : "dashboard");
    const choices = defaultChoices(steps);
    // Lines are the one thing nothing preselects.
    const lines = steps.flatMap((s) => (s.step === "lines" ? [{ repeat: s.repeat, person: { who: "me" as const } }] : []));
    const plan = planStart(d, UNLIMITED, { ...choices, lines }, { me: { id: "me-id", name: "Olive Owner" }, people: [] });
    expect(plan.problems).toEqual([]);
    expect(plan.leftOut).toEqual([]);
    expect(plan.metrics).toHaveLength(d.metrics.length);
    expect(plan.invite).toEqual([]);
    expect(plan.contacts).toEqual([]);
  });

  it("heads what happens with the Workflow's rhythm, and with neutral words where it asks for several periods", () => {
    const heading = (id: string) => step(startSteps(stored(id), UNLIMITED), "preview").heading;
    expect([heading("sales-forecast"), heading("finance")]).toEqual(["Every week", "Every month"]);
    expect([heading("board-meeting"), heading("sports-club"), heading("workspace-usage")]).toEqual(["What happens", "What happens", "What happens"]);
  });

  it("asks one question of a Pack without Positions, with the person setting up preselected", () => {
    const steps = startSteps(stored("sports-club"), UNLIMITED);
    expect(kinds(steps)).toEqual(["preview", "providers", "check"]);
    expect(step(steps, "providers").preselected).toBe("me");
  });

  it("preselects nobody and the system where every number comes from a system", () => {
    for (const id of ["workspace-usage", "ziffr-operations"]) {
      const steps = startSteps(stored(id), UNLIMITED);
      expect(kinds(steps)).toEqual(["preview", "providers", "source", "check"]);
      expect(step(steps, "providers").preselected).toBe("nobody");
      expect(step(steps, "source").preselected).toBe("system");
    }
  });

  it("asks the sales forecast for its team, its lead and where the CRM's numbers come from, and for no providers", () => {
    const steps = startSteps(stored("sales-forecast"), UNLIMITED);
    expect(kinds(steps)).toEqual(["preview", "lines", "who", "source", "check"]);
    const lines = step(steps, "lines");
    expect(lines).toMatchObject({ repeat: "rep", asksName: false, question: "List each Salesperson", limit: { allowed: 30, because: "pack" } });
    expect(lines.person).toMatchObject({ position: "seller", needsRole: false });
    expect(step(steps, "who")).toMatchObject({ position: "sales-lead", question: "Who is Sales lead?", needsRole: true });
    expect(step(steps, "source")).toMatchObject({ preselected: "typed" });
    expect(step(steps, "source").templates).toContain("hubspot-forecast");
  });

  it("fits four lines of the sales forecast into a fresh trial", () => {
    expect(step(startSteps(stored("sales-forecast"), TRIAL), "lines").limit).toEqual({ allowed: 4, because: "people" });
    expect(step(startSteps(stored("sales-forecast"), { ...TRIAL, trial: { metricCap: 25, places: 20, others: 0 } }), "lines").limit).toEqual({ allowed: 4, because: "metrics" });
  });

  it("says why a Pack does not fit", () => {
    expect(step(startSteps(stored("ziffr-operations"), TRIAL), "preview").blocked).toBe("A trial holds at most 25 Metrics. This Pack makes at least 36, and there is room for 25.");
    expect(step(startSteps(stored("sales-forecast"), { metrics: 3, trial: null, practice: false }), "preview").blocked).toContain("there is room for 3");
  });
});

describe("what a Pack declares for its set-up", () => {
  const declaring = (words: Record<string, unknown>, ask: unknown, question: unknown) => stored("sales-forecast", (m) => {
    const places = m.places as { repeats: Record<string, unknown>[]; metrics: Record<string, unknown>[] };
    return { ...m, setUp: words, places: { ...places, repeats: places.repeats.map((r) => ({ ...r, question })), metrics: places.metrics.map((x) => (x.key === "commit" ? { ...x, ask } : x)) } };
  });

  it("is read where it is there", () => {
    const d = declaring({ line: "A weekly forecast meeting, prepared for you.", happens: ["Monday: your salespeople are asked"], needs: ["Names"] }, { question: "What is each quota this quarter?", name: "Quota", every: "quarter" }, "Who is in your sales team?");
    const steps = startSteps(d, UNLIMITED);
    expect(step(steps, "preview")).toMatchObject({ line: "A weekly forecast meeting, prepared for you.", heading: "Every week", happens: ["Monday: your salespeople are asked"], needs: ["Names"] });
    expect(step(steps, "lines").question).toBe("Who is in your sales team?");
    expect(step(steps, "numbers").asks).toEqual([{ metric: "commit", name: "Commit", question: "What is each quota this quarter?", field: "Quota", every: "quarter", repeat: "rep", total: "Team commit" }]);
  });

  it("is left out where it is markup, an address, too long or of the wrong shape", () => {
    const d = declaring({ line: "<b>Bold</b>", happens: ["See https://example.org", "x".repeat(91), 7, "Kept"], needs: "no list" }, { question: "x".repeat(91), name: "Quota", every: "quarter" }, "[Press here](javascript:alert(1))");
    const steps = startSteps(d, UNLIMITED);
    expect(step(steps, "preview").line).toBe(d.summary);
    expect(step(steps, "preview").happens).toEqual(["Kept"]);
    expect(step(steps, "preview").needs).toEqual([]);
    expect(step(steps, "lines").question).toBe("List each Salesperson");
    expect(kinds(steps)).not.toContain("numbers");
  });
});
