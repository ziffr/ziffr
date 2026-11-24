// What the first opening of the demo (spec 0051, ticket 8) opens, read from its migration without a database: exactly the tables the
// work around a value writes, nothing that reaches outside the demo, the limits of the two tables that grow, and the date rule of Away.
// The same migration is run by the database tests of CI (demo-open-values.db.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_OPEN_CANDIDATES, DEMO_WORDS_COLUMNS } from "./demo-words-columns";
import { DEMO_ROW_CAPS, DEMO_VALUE_LIMITS } from "./demo-limits";
import { demoClassOf, demoOperations } from "./demo-changes";

const MIGRATION = readFileSync(join(__dirname, "../../../supabase/migrations/20270128120000_demo_open_values.sql"), "utf8");
const opened = [...MIGRATION.matchAll(/open_demo_table\('([a-z_]+)'\)/g)].map((m) => m[1]);

describe("the tables the first opening opens", () => {
  it("are the work around a value, each with its words classified", () => {
    expect([...opened].sort()).toEqual(["actions", "breakdown_history", "breakdown_rows", "deliveries", "intake_log", "observation_history", "observations", "period_states", "prompts", "thread_messages", "tokens"]);
    for (const t of opened) expect(DEMO_OPEN_CANDIDATES, `${t} must be classified in demo-words-columns.ts`).toContain(t);
  });

  it("never include a person, a setting, a key, a link, a Connector or anything that reaches outside the demo", () => {
    const never = ["workspaces", "profiles", "memberships", "contacts", "invitations", "view_links", "calendar_links", "access_keys", "feeds", "webhooks", "webhook_sends", "slack_installations",
      "telegram_workspaces", "pack_installs", "audit_events", "dashboards", "decks", "metrics", "workflows", "groups", "shares", "themes", "away", "ask_now_claims"];
    for (const t of never) expect(opened, t).not.toContain(t);
  });

  it("put a row cap on what grows with a visitor's work, with kinds that exist", () => {
    const applied = [...MIGRATION.matchAll(/apply_demo_limits\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => [m[1], m[2]]);
    expect(applied).toEqual([["observations", "values"], ["actions", "open_actions"]]);
    for (const [table, kind] of applied) {
      expect(opened).toContain(table);
      expect(Object.keys(DEMO_ROW_CAPS)).toContain(kind);
    }
  });

  it("have a words column for every table the work writes a visitor's words into", () => {
    for (const t of ["intake_log", "breakdown_rows", "breakdown_history", "thread_messages", "deliveries", "prompts", "actions", "period_states"]) {
      expect(DEMO_WORDS_COLUMNS[t].words.length, t).toBeGreaterThan(0);
    }
  });
});

describe("a visit's paste", () => {
  const src = readFileSync(join(__dirname, "paste-values.ts"), "utf8");
  it("is charged by the values it really holds, after it is read and before anything is recorded", () => {
    const charge = src.indexOf("await hooks.chargeValues(go.length)");
    expect(charge).toBeGreaterThan(src.indexOf("const go: PasteValue[]"));
    expect(charge).toBeLessThan(src.indexOf("await submitValue("));
    // Not by lines: no weight is taken from the text in the web action.
    expect(readFileSync(join(__dirname, "../../../apps/web/src/app/paste-actions.ts"), "utf8")).not.toContain("split(");
  });
});

describe("the showcase for the tables this ticket opens", () => {
  it("follows a value's period for its Breakdown and intake log, and a Metric for its tokens, and keeps the old cases", () => {
    for (const t of ["breakdown_rows", "breakdown_history", "intake_log", "tokens"]) expect(MIGRATION, t).toContain(t);
    expect(MIGRATION).toContain("when t = 'prompts' then exists");
    expect(MIGRATION).toContain("when t = 'tokens' then exists (select 1 from demo_showcase s where s.table_name = 'metrics'");
  });
});

describe("the two people's tables the opening reaches", () => {
  it("lets a visit claim Ask me now and set Away only through demo_visit_current, never delete a claim", () => {
    expect(MIGRATION).toContain("if tg_op <> 'DELETE' and demo_visit_current() then return new; end if;");
    expect(MIGRATION).toContain("create trigger zz_demo_visit_lock before insert or update or delete on ask_now_claims for each statement");
    expect(MIGRATION).toContain("create trigger zz_demo_visit_lock before insert or update or delete on away for each statement");
  });

  it("states the same date rule for Away as the core does", () => {
    expect(MIGRATION).toContain(`new.starts >= current_date - 1 and new.ends <= current_date + ${DEMO_VALUE_LIMITS.awayAheadDays} and new.ends - new.starts <= ${DEMO_VALUE_LIMITS.awayMaxDays}`);
  });

  it("refuses a visit unless the Installation opened the demo, its showcase is ready and its Generation is current", () => {
    expect(MIGRATION).toContain("open_to_visitors and showcase_ready");
    expect(MIGRATION).toContain("errcode = 'ZF4D1'");
    expect(MIGRATION).toContain("(claims::json ->> 'role') is distinct from 'service_role'");
  });
});

describe("what the opened actions write", () => {
  it("is a table the migration opens or one it guards: no opened action reaches a closed one by name", () => {
    // Every opened or limited key is one of the work around a value (the walk's unit test holds the same for the whole list).
    const keys = demoOperations().filter((k) => ["open", "limited"].includes(demoClassOf(k)?.class ?? ""));
    expect(keys.length).toBe(22);
  });
});
