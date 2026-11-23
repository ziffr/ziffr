// @ts-nocheck
// The Trial Limits (spec 0040, ticket 2): every range's edges, the default for anything outside, the names in the
// Installation catalogue, and that every limit is written down in the self-hosting guide, the user guide and the Cloud API
// reference (a limit nobody can find is not one an operator can use).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSTALLATION_SETTINGS } from "./installation-catalogue";
import { TRIAL_LIMIT_COLUMNS, TRIAL_LIMITS, trialLimitFrom, trialLimitNumberProblem, trialLimitProblem, trialLimitsFrom } from "./trial-limits";

const doc = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("the ranges", () => {
  for (const l of TRIAL_LIMITS) {
    it(`${l.name} takes ${l.min} to ${l.max} whole numbers and nothing else`, () => {
      for (const ok of [l.min, l.max, l.default]) {
        expect(trialLimitProblem(l, String(ok)), `${l.name}=${ok}`).toBeNull();
        expect(trialLimitFrom({ [l.name]: String(ok) }, l.key)).toBe(ok);
        expect(trialLimitNumberProblem(l, ok)).toBeNull();
      }
      for (const bad of [String(l.min - 1), String(l.max + 1), "1.5", "-3", "abc", "", " ", "1e3", "0x10", "99999999999"]) {
        expect(trialLimitProblem(l, bad), `${l.name}=${bad}`).toMatch(/is a whole number from|must be from/);
        expect(trialLimitFrom({ [l.name]: bad }, l.key), `${l.name}=${bad}`).toBe(l.default);
      }
      for (const bad of [l.min - 1, l.max + 1, 1.5, "7", null, NaN]) expect(trialLimitNumberProblem(l, bad), `${l.name}=${String(bad)}`).not.toBeNull();
      expect(trialLimitFrom({}, l.key)).toBe(l.default);
    });
  }

  it("has the spec's defaults", () => {
    expect(trialLimitsFrom({})).toEqual({ days: 14, graceDays: 7, max: 500, people: 5, invitationsPerDay: 10, invitationsAllPerDay: 500, metrics: 25, messagesPerDay: 100, keys: 2, feeds: 2, assistants: 1, webhooks: 2, webhookSendsPerDay: 200, viewLinks: 5 });
  });

  it("is a setting of the Installation catalogue, one each, in the Trial Limits section", () => {
    for (const l of TRIAL_LIMITS) expect(INSTALLATION_SETTINGS.filter((s) => s.name === l.name && s.section === "trial_limits"), l.name).toHaveLength(1);
    expect(new Set(TRIAL_LIMITS.map((l) => l.name)).size).toBe(TRIAL_LIMITS.length);
  });

  it("keeps the database row inside its checks: every number the triggers read has the same range there", () => {
    // trial_limits' check constraints (migration 20270115000000) are the ranges of these limits.
    const migration = doc("supabase/migrations/20270115000000_trial_limits.sql") + doc("supabase/migrations/20270116500000_people_in_trial.sql");
    for (const [key, column] of Object.entries(TRIAL_LIMIT_COLUMNS)) {
      const l = TRIAL_LIMITS.find((x) => x.key === key)!;
      expect(migration, column).toContain(`${column} int not null default ${l.default} check (${column} between ${l.min} and ${l.max})`);
    }
  });
});

describe("the documents", () => {
  const selfHosting = doc("docs/guides/self-hosting.md");
  const userGuide = doc("docs/user-guide/18-installation-settings.md");
  const cloudApi = doc("docs/reference/cloud-api.md");
  for (const l of TRIAL_LIMITS) {
    it(`${l.key} is in the self-hosting reference, the user guide and the Cloud API reference`, () => {
      expect(selfHosting, "self-hosting").toContain(`\`${l.name}\``);
      expect(userGuide, "user guide").toContain(`**${l.label}**`);
      expect(cloudApi, "Cloud API").toContain(`\`${l.key}\``);
    });
  }
});
