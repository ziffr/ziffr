// The demo's seeded words and showcase (GLOSSARY: Demo Mode; spec 0051, ticket 6), tried without a database: the list of
// words columns agrees with the migration that fills the database's copy, no migration opens a table that is not on
// it, and the refusals say what the spec says. The schema itself is compared in demo-showcase.db.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DemoSeededWords, DemoShowcase, protectedRefusal } from "./demo";
import { DEMO_SEEDED_WORDS, DEMO_SHOWCASE, demoWordsForDigest } from "./demo-words";
import { DEMO_OPEN_CANDIDATES, DEMO_WORDS_COLUMNS, SEALED_NOT_WORDS, demoKeptRowTables, demoWordsColumnRows } from "./demo-words-columns";
import { SEALED_COLUMNS } from "./sealed-columns";
import { SETTING_WORDS } from "./sealed-words";

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const migration = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");
const SHOWCASE = migration("20270126130000_demo_showcase.sql");

describe("the words columns", () => {
  it("name every column once: a column is words, kept or other, never two", () => {
    for (const [table, t] of Object.entries(DEMO_WORDS_COLUMNS)) {
      const all = [...t.words, ...(t.kept ?? []), ...t.other];
      expect(new Set(all).size, `${table} names a column twice`).toBe(all.length);
    }
  });

  it("are the rows the migration puts in demo_words_columns", () => {
    const body = SHOWCASE.slice(SHOWCASE.indexOf("insert into demo_words_columns"), SHOWCASE.indexOf("insert into demo_kept_rows"));
    // A later migration may add a column to the words (ticket 9 added a Theme's tokens): its rows count as the database's copy too.
    const later = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f > "20270126130000_demo_showcase.sql")
      .flatMap((f) => [...migration(f).matchAll(/insert into demo_words_columns \(table_name, column_name, kind\) values ([^;]*);/g)].map((m) => m[1])).join("\n");
    const inMigration = [...`${body}\n${later}`.matchAll(/\('([a-z_]+)', '([a-z_]+)', '(words|kept)'\)/g)].map((m) => `${m[1]}.${m[2]}.${m[3]}`).sort();
    expect(inMigration).toEqual(demoWordsColumnRows().map(([t, c, k]) => `${t}.${c}.${k}`).sort());
  });

  it("are the tables the migration keeps the seeded rows of", () => {
    const body = SHOWCASE.slice(SHOWCASE.indexOf("insert into demo_kept_rows"), SHOWCASE.indexOf("-- The key of a row"));
    expect([...body.matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]).sort()).toEqual(demoKeptRowTables().sort());
  });

  it("get the words trigger, and with it the fail-closed check, on every candidate table", () => {
    const attached = SHOWCASE.slice(SHOWCASE.indexOf("foreach t in array array["), SHOWCASE.indexOf("loop", SHOWCASE.indexOf("foreach t in array array[")));
    const tables = new Set([...attached.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    for (const table of DEMO_OPEN_CANDIDATES) expect(tables.has(table), `${table} is a candidate but has no words trigger`).toBe(true);
  });

  it("keep the keys of a widget's settings that hold words as the migration says, and cover SETTING_WORDS", () => {
    // The last migration that sets them wins (ticket 9 added the highlight, callouts and panels).
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort().flatMap((f) => [...migration(f).matchAll(/set keys = array\[([^\]]*)\] where table_name = 'widgets' and column_name = 'settings'/g)].map((x) => x[1]));
    const inMigration = [...(all[all.length - 1] ?? "").matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]).sort();
    expect(inMigration).toEqual([...DEMO_WORDS_COLUMNS.widgets.wordKeys!.settings].sort());
    for (const key of SETTING_WORDS) expect(inMigration).toContain(key);
    expect(inMigration).toContain("canvasSeed");
  });

  it("never call a column `other` that the code seals words into, unless it says why it is no words", () => {
    for (const [table, columns] of Object.entries(SEALED_COLUMNS)) {
      const t = DEMO_WORDS_COLUMNS[table];
      if (!t) continue;
      for (const column of columns as readonly string[]) {
        if ((SEALED_NOT_WORDS[table] ?? []).includes(column)) continue;
        expect([...t.words, ...(t.kept ?? [])], `${table}.${column} is sealed words but not classified as words`).toContain(column);
      }
    }
  });

  it("have the jsonb columns that hold the seed's words classified as words", () => {
    for (const [table, column] of [["widgets", "settings"], ["workflows", "config"], ["themes", "slides"], ["team_templates", "body"], ["team_templates", "slots"]]) {
      expect(DEMO_WORDS_COLUMNS[table].words, `${table}.${column}`).toContain(column);
    }
  });

  it("keeps the words trigger out of reach of the core, and refuses every visit while the showcase is not ready", () => {
    expect(SHOWCASE).toContain("attach_demo_words_guard(regclass) from public, anon, authenticated, service_role");
    expect(SHOWCASE).toContain("if not coalesce((select showcase_ready from demo_state where id), false) then raise exception using errcode = 'ZF4D0'");
    expect(SHOWCASE).toContain("select generation, showcase_ready into gen, ready from demo_state where id for update");
    expect(SHOWCASE).toContain("update demo_state set showcase_ready = true where id and generation = gen");
    expect(SHOWCASE).toContain("if new.generation is distinct from old.generation then new.showcase_ready := false");
  });

  it("classify every table that any migration opens to visitors", () => {
    const opened = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql") && f !== "20270126090000_demo_allow_list.sql")
      .flatMap((f) => [...migration(f).matchAll(/open_demo_table\(\s*'(?:public\.)?([a-z_]+)'/g)].map((m) => m[1]));
    for (const table of opened) expect(DEMO_OPEN_CANDIDATES, `${table} is opened to visitors but its words columns are not classified in demo-words-columns.ts`).toContain(table);
  });

  it("never list the tables of people, settings or anything that reaches outside the demo", () => {
    const never = ["workspaces", "profiles", "memberships", "contacts", "invitations", "view_links", "calendar_links", "access_keys", "feeds", "webhooks", "slack_installations", "pack_installs", "audit_events"];
    for (const table of never) expect(DEMO_OPEN_CANDIDATES).not.toContain(table);
  });
});

describe("the refusals", () => {
  it("say, in the spec's words, that everyone sees it as it is and that its words stay", () => {
    expect(new DemoShowcase().message).toBe("Everyone sees this one as it is. Make your own to change it.");
    expect(new DemoSeededWords().message).toBe("Everyone sees this one's words as they are. Make your own to name it.");
  });

  it("name no kind of object, so they are true of every one", () => {
    for (const words of [DEMO_SHOWCASE, DEMO_SEEDED_WORDS]) expect(words).not.toMatch(/dashboard|deck|metric|snapshot|workflow/i);
  });

  it("reach the error screen from a fixed digest, never from text of the server", () => {
    expect(demoWordsForDigest(new DemoShowcase().digest)).toBe(DEMO_SHOWCASE);
    expect(demoWordsForDigest(new DemoSeededWords().digest)).toBe(DEMO_SEEDED_WORDS);
    expect(demoWordsForDigest("anything else")).toBeNull();
  });

  it("are what the database's codes become, and nothing else is", () => {
    expect(protectedRefusal({ code: "ZF4D3" })).toBeInstanceOf(DemoShowcase);
    expect(protectedRefusal({ code: "ZF4D4" })).toBeInstanceOf(DemoSeededWords);
    for (const e of [{ code: "ZF4D0" }, { code: "ZF4D1" }, { code: "23505" }, {}, null, undefined, "ZF4D3"]) expect(protectedRefusal(e)).toBeNull();
  });
});
