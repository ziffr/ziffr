// Installation Usage against the real database (spec 0031, ticket #365): the Usage Key is shown once, stored as a hash,
// one at a time and revocable; the figures hold only listed keys and no name of anything, even from a hostile table;
// fewer than 3 Workspaces get totals only; the excluded Workspace and the demo are in no figure.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import {
  usageExcludedWorkspace, usageExclusionChoices, authenticateUsageKey, installationUsage, makeUsageKey, revokeUsageKey, usageDayView, usageKeyInfo, usageRollupJob, USAGE_FIGURES, USAGE_KEY_CALLS_PER_HOUR, UsageRangeError, usageRange,
} from "./installation-usage";
import { saveInstallationSettings } from "./installation-settings";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { installationAdmin, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); delete process.env.ZIFFR_USAGE_EXCLUDE_WORKSPACE; forgetStoredSettings(); });
afterAll(async () => { await db().from("installation_usage_daily").delete().lt("day", "2021-01-01"); });
async function admin() { const a = await installationAdmin(); cleanups.push(a.cleanup); return a.actor; }
async function ws() { const w = await workspace("<script>alert(1)</script> Hostile"); cleanups.push(w.cleanup); return w; }
const rollup = async (day: string, exclude: string | null = null, states = true) => (await db().rpc("usage_rollup_day", { p_day: day, p_exclude: exclude, p_states: states })).data as Record<string, unknown>;

describe("the Usage Key", () => {
  it("is shown once, stored as a hash, one live at a time, and revocable", async () => {
    const a = await admin();
    const { secret } = await makeUsageKey(a);
    expect(secret).toMatch(/^zu_[0-9a-f]{6}_/);
    const stored = JSON.stringify((await db().from("usage_keys").select("*")).data);
    expect(stored).not.toContain(secret);
    // The random part is base64url, which may itself contain "_": cut after the fixed "zu_<6 hex>_" rather than split.
    const prefix = secret.slice(3, 9);
    const random = secret.slice(10);
    expect(random.length).toBeGreaterThan(30);
    expect(stored).not.toContain(random);
    const info = await usageKeyInfo(a);
    expect(info).toMatchObject({ prefix });
    expect(JSON.stringify(info)).not.toContain(secret);
    expect(await authenticateUsageKey(secret)).toMatchObject({ usageKey: true });
    const second = await makeUsageKey(a);
    expect(await authenticateUsageKey(secret)).toBeNull();
    expect(await authenticateUsageKey(second.secret)).toMatchObject({ usageKey: true });
    expect((await db().from("usage_keys").select("id").is("revoked_at", null)).data).toHaveLength(1);
    await revokeUsageKey(a);
    expect(await authenticateUsageKey(second.secret)).toBeNull();
    expect(await usageKeyInfo(a)).toBeNull();
  });
  it("is made and revoked by Installation Admins only, and read by no one else", async () => {
    const outsider = { personId: "t-nobody" };
    await expect(makeUsageKey(outsider)).rejects.toBeInstanceOf(Forbidden);
    await expect(revokeUsageKey(outsider)).rejects.toBeInstanceOf(Forbidden);
    await expect(usageKeyInfo(outsider)).rejects.toBeInstanceOf(Forbidden);
    await expect(installationUsage(outsider)).rejects.toBeInstanceOf(Forbidden);
    await expect(installationUsage({} as never)).rejects.toBeInstanceOf(Forbidden);
  });
  it("answers null for no key, a wrong one, an Access Key's look-alike and the job secret", async () => {
    const a = await admin();
    const { secret } = await makeUsageKey(a);
    process.env.ZIFFR_JOB_SECRET = "j".repeat(40);
    for (const bad of [undefined, null, "", "zu_000000_wrong", secret.slice(0, -1), `${secret}x`, "zk_abcdef_whatever", "j".repeat(40)]) expect(await authenticateUsageKey(bad)).toBeNull();
    delete process.env.ZIFFR_JOB_SECRET;
  });
  it("is limited to 60 calls an hour", async () => {
    const a = await admin();
    const { secret } = await makeUsageKey(a);
    for (let i = 0; i < USAGE_KEY_CALLS_PER_HOUR; i++) expect(await authenticateUsageKey(secret)).toMatchObject({ usageKey: true });
    expect(await authenticateUsageKey(secret)).toBe("limited");
    await db().from("usage_keys").update({ window_started_at: new Date(Date.now() - 3_700_000).toISOString() }).is("revoked_at", null);
    expect(await authenticateUsageKey(secret)).toMatchObject({ usageKey: true });
  });
});

describe("the figures", () => {
  it("hold only listed keys and no name, from a hostile Workspace, Metric and Pack", async () => {
    const a = await admin();
    const w = await ws(); const sara = await w.person("owner", { email: "secret.person@example.com" });
    await w.metric(sara, { name: "boss@example.com's salary" });
    await db().from("pack_installs").insert({ workspace_id: w.id, pack_id: "evil-uploaded-pack-name", version: "1.0.0", license: "MIT", source: "upload", manifest: { name: "Evil" }, installed_by: sara, item_keys: [] });
    const day = "2020-01-15";
    await db().from("installation_usage_daily").upsert({ day, figures: { ...(await rollup(day)), "Hostile Workspace": 1, secret_key: "x", workspaces_trial: "<script>" } });
    const [row] = await installationUsage(a, { from: day, to: day });
    expect(row.day).toBe(day);
    for (const k of Object.keys(row)) expect(["day", "packs", "withheld", ...USAGE_FIGURES]).toContain(k);
    const text = JSON.stringify(row);
    for (const leak of ["Hostile", "script", "secret", "example.com", "salary", "evil-uploaded", w.id, sara]) expect(text).not.toContain(leak);
    for (const [k, v] of Object.entries(row)) if (!["day", "packs", "withheld"].includes(k)) expect(Number.isInteger(v)).toBe(true);
  });
  it("count nothing of the demo or of the excluded Workspace, and leave states out for a missed day", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await w.metric(sara); await w.metric(sara);
    const day = "2020-01-16";
    const all = await rollup(day);
    const without = await rollup(day, w.id);
    expect(Number(all.workspaces) - Number(without.workspaces)).toBe(1);
    expect(Number(all.metrics) - Number(without.metrics)).toBe(2);
    const { data: demo } = await db().from("workspaces").select("id").eq("id", DEMO_WORKSPACE_ID);
    const onlyDemo = await rollup(day, null);
    expect(Number(onlyDemo.workspaces)).toBe(Number(all.workspaces));
    expect(JSON.stringify(without)).not.toContain(w.id);
    const events = await rollup(day, null, false);
    expect(events.workspaces).toBeUndefined();
    expect(events.metrics).toBeUndefined();
    expect(events.api_calls).toBeDefined();
    expect(demo).toBeDefined();
  });
  it("count a day's events and views from the counters", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const day = "2020-01-17";
    await db().from("usage_counts").insert({ day, kind: "api_calls", workspace_id: w.id, n: 7 });
    await db().from("view_counts").insert({ workspace_id: w.id, day, subject_kind: "metric", subject_id: m.id, n_app: 2, n_link: 1, n_api: 5 });
    const base = await rollup(day, w.id);
    const f = await rollup(day);
    expect(Number(f.api_calls) - Number(base.api_calls)).toBe(7);
    expect(Number(f.views_metrics) - Number(base.views_metrics)).toBe(3);
  });
  it("the job writes yesterday and fills the days it missed", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await db().from("installation_usage_daily").delete().gte("day", "2021-01-01");
    const r = await usageRollupJob();
    expect(r.days).toBeGreaterThanOrEqual(1);
    const { data } = await db().from("installation_usage_daily").select("day").gte("day", "2021-01-01").order("day");
    expect(data!.at(-1)!.day).toBe(yesterday);
    expect((await usageRollupJob()).days).toBe(0);
    await db().from("installation_usage_daily").delete().gte("day", "2021-01-01");
  });
});

describe("the Workspace left out", () => {
  it("is picked by an Installation Admin, must be a real Workspace but not the demo, and is read back", async () => {
    const a = await admin(); const w = await ws();
    await expect(saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: "not-an-id" })).rejects.toThrow(/by name/);
    await expect(saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: "00000000-0000-4000-8000-0000000000ee" })).rejects.toThrow(/by name/);
    await expect(saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: DEMO_WORKSPACE_ID })).rejects.toThrow(/by name/);
    await expect(saveInstallationSettings({ personId: "t-nobody" }, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: w.id })).rejects.toBeInstanceOf(Forbidden);
    // Not one the Admin owns: leaving it out would show its size by differencing two days.
    await expect(saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: w.id })).rejects.toThrow(/you own/);
    expect(await usageExclusionChoices(a)).toEqual([]);
    await db().from("memberships").insert({ workspace_id: w.id, user_id: a.personId, role: "owner" });
    expect(await usageExclusionChoices(a)).toEqual([{ workspaceId: w.id, name: expect.any(String) }]);
    await saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: w.id });
    expect(await usageExcludedWorkspace()).toBe(w.id);
    // Another Installation Admin who does not own it can neither clear nor replace it; its owner can.
    const other = await admin(); const w2 = await ws();
    await db().from("memberships").insert({ workspace_id: w2.id, user_id: other.personId, role: "owner" });
    await expect(saveInstallationSettings(other, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: null })).rejects.toThrow(/Only an Owner/);
    await expect(saveInstallationSettings(other, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: w2.id })).rejects.toThrow(/Only an Owner/);
    expect(await usageExcludedWorkspace()).toBe(w.id);
    // A read that fails refuses the change, even for the owner (it never reads as "nothing is left out").
    const real = db(); const orig = real.from.bind(real);
    const spy = vi.spyOn(real, "from").mockImplementation(((t: string) => t === "workspaces" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) } : orig(t)) as never);
    await expect(saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: null })).rejects.toThrow(/could not be checked/);
    spy.mockRestore();
    await saveInstallationSettings(a, "usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: null });
    expect(await usageExcludedWorkspace()).toBeNull();
  });
});

describe("small numbers", () => {
  const stored = { workspaces: 2, workspaces_trial: 1, workspaces_free: 1, workspaces_paid: 0, values_web: 5, values_api: 6, metrics: 9, people: 4, api_calls: 3, packs_installed: 2, packs: [{ id: "starter-pack", installs: 2 }] };
  it("gives totals only below 3 Workspaces and names what is held back", () => {
    const d = usageDayView("2026-11-01", stored);
    expect(d).toMatchObject({ workspaces: 2, metrics: 9, people: 4, api_calls: 3 });
    for (const k of ["workspaces_trial", "workspaces_free", "workspaces_paid", "values_web", "values_api", "packs"]) expect(d[k]).toBeUndefined();
    expect(d.withheld).toEqual(expect.arrayContaining(["workspaces_trial", "workspaces_free", "workspaces_paid", "values_web", "values_api", "packs"]));
  });
  it("splits at 3 Workspaces and shows only Packs with 3 installs", () => {
    const d = usageDayView("2026-11-01", { ...stored, workspaces: 9, workspaces_trial: 3, workspaces_free: 3, workspaces_paid: 3, values_web_ws: 3, values_api_ws: 3, packs_installed: 6, packs: [{ id: "starter-pack", installs: 4 }, { id: "tiny-pack", installs: 2 }, { id: 5, installs: 9 }] });
    expect(d).toMatchObject({ workspaces_trial: 3, values_web: 5, values_api: 6 });
    expect(d.values_web_ws).toBeUndefined();
    expect(d.packs).toEqual([{ id: "starter-pack", installs: 4 }]);
    expect(d.withheld).toEqual(["packs"]);
  });
  it("withholds a figure that rests on fewer than 3 Workspaces even in a large Installation, and all three kinds together", () => {
    const big = { workspaces: 10, workspaces_trial: 4, workspaces_free: 5, workspaces_paid: 1, values_telegram: 40, values_telegram_ws: 1, values_slack: 9, values_slack_ws: 4, values_email: 0, values_email_ws: 0, metrics: 50 };
    const d = usageDayView("2026-11-01", big);
    expect(d).toMatchObject({ workspaces: 10, metrics: 50, values_slack: 9, values_email: 0 });
    for (const k of ["workspaces_trial", "workspaces_free", "workspaces_paid", "values_telegram"]) { expect(d[k]).toBeUndefined(); expect(d.withheld).toContain(k); }
    expect(JSON.stringify(d)).not.toContain("_ws");
    expect(usageDayView("2026-11-01", { ...big, workspaces_trial: 0, workspaces_free: 6, workspaces_paid: 4 })).toMatchObject({ workspaces_trial: 0, workspaces_free: 6, workspaces_paid: 4 });
  });
  it("is the same through the core function from a stored day", async () => {
    const a = await admin();
    const day = "2020-01-18";
    await db().from("installation_usage_daily").upsert({ day, figures: stored });
    const [d] = await installationUsage(a, { from: day, to: day });
    expect(d.workspaces_trial).toBeUndefined();
    expect(d.withheld).toContain("values_web");
  });
});

describe("the range", () => {
  it("defaults to the last 30 days ending yesterday, refuses today and beyond 400 days, and clamps to yesterday", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const r = usageRange({});
    expect(r.to).toBe(yesterday);
    expect((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000).toBe(29);
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    expect(usageRange({ from: recent, to: "2999-01-01" }).to).toBe(yesterday);
    expect(() => usageRange({ from: "2020-01-01", to: "2021-03-01" })).toThrow(UsageRangeError);
    expect(() => usageRange({ from: "2026-02-31" })).toThrow(UsageRangeError);
    expect(() => usageRange({ from: "nope" })).toThrow(UsageRangeError);
    expect(() => usageRange({ from: "2999-01-01" })).toThrow(UsageRangeError);
  });
});
