// The migration that opens Metrics, Threads and sharing (spec 0051, ticket 11) says what the core says, without a database: the tables
// it opens are classified (words, kept, other), the caps it adds are the core's numbers, and nothing it must not open is opened.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_OPEN_CANDIDATES } from "./demo-words-columns";
import { DEMO_ROW_CAPS } from "./demo-limits";
import { demoLimitKinds } from "./demo-words";

const MIGRATION = readFileSync(join(__dirname, "../../../supabase/migrations/20270130090000_demo_open_metrics.sql"), "utf8");
const opened = [...MIGRATION.matchAll(/open_demo_table\('([a-z_]+)'\)/g)].map((m) => m[1]);
const applied = [...MIGRATION.matchAll(/apply_demo_limits\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => [m[1], m[2]]);

describe("the tables this ticket opens", () => {
  it("are exactly the ones behind Metrics, Targets, Tags, Groups, Shares, access requests and the preferred channel", () => {
    expect(opened.sort()).toEqual(["access_requests", "delivery_preferences", "group_members", "groups", "metric_tags", "metrics", "series_values", "shares", "tags"]);
  });

  it("were classified by ticket 6 (their words, kept and other columns are named), so none is open by accident", () => {
    for (const t of opened) expect(DEMO_OPEN_CANDIDATES, t).toContain(t);
  });

  it("never include what reaches outside the demo or what a visit must not change", () => {
    for (const t of ["profiles", "memberships", "contacts", "invitations", "view_links", "calendar_links", "access_keys", "feeds", "feed_keys", "webhooks", "workspaces", "workflows", "retention", "audit_events"]) {
      expect(opened, t).not.toContain(t);
    }
  });
});

describe("the caps this ticket adds", () => {
  it("are on tables it opens (and the Thread messages ticket 8 opened), for kinds the core knows and has words for", () => {
    for (const [table, kind] of applied) {
      expect([...opened, "thread_messages"], `${table} carries a cap but is not opened by this or the ticket before`).toContain(table);
      expect(Object.keys(DEMO_ROW_CAPS), kind).toContain(kind);
      expect(demoLimitKinds(), kind).toContain(kind);
    }
  });

  it("say the core's numbers", () => {
    const rows = [...MIGRATION.matchAll(/\('([a-z_]+)', (\d+), null, (null|'[a-z_]+'), (null|'[a-z]+')\)/g)];
    expect(rows.length).toBe(6);
    for (const [, kind, max] of rows) expect(DEMO_ROW_CAPS[kind as keyof typeof DEMO_ROW_CAPS], kind).toBe(Number(max));
  });

  it("count a calculated Metric by the column set with its formula, and put a creation time on Shares and Group members", () => {
    expect(MIGRATION).toContain("('derived_metrics', 5, null, 'inputs_checked', 'true')");
    expect(MIGRATION).toMatch(/alter table shares add column created_at/);
    expect(MIGRATION).toMatch(/alter table group_members add column created_at/);
  });
});

describe("the Tags of a showcase Metric", () => {
  it("are refused to a visit by a trigger that sorts after the demo guard, for the demo's rows only", () => {
    expect(MIGRATION).toMatch(/create trigger zzz_demo_metric_tags_new before insert or update on metric_tags[\s\S]*'d3e00000-0000-4000-8000-000000000001'/);
    expect(MIGRATION).toMatch(/create trigger zzz_demo_metric_tags_old before delete on metric_tags/);
    expect(MIGRATION).toContain("demo_object_in_showcase('metric'");
  });
});
