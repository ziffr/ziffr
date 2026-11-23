// The demo's seeded words and showcase (GLOSSARY: Demo Mode; spec 0051, ticket 6), tried without a database: the list of
// words columns agrees with the migration that fills the database's copy, no migration opens a table that is not on
// it, and the refusals say what the spec says. The schema itself is compared in demo-showcase.db.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DemoSeededWords, DemoShowcase, protectedRefusal } from "./demo";
import { DEMO_SEEDED_WORDS, DEMO_SHOWCASE, demoWordsForDigest } from "./demo-words";
import { DEMO_OPEN_CANDIDATES, DEMO_WORDS_COLUMNS, demoKeptRowTables, demoWordsColumnRows } from "./demo-words-columns";

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
    const inMigration = [...body.matchAll(/\('([a-z_]+)', '([a-z_]+)', '(words|kept)'\)/g)].map((m) => `${m[1]}.${m[2]}.${m[3]}`).sort();
    expect(inMigration).toEqual(demoWordsColumnRows().map(([t, c, k]) => `${t}.${c}.${k}`).sort());
  });

  it("are the tables the migration keeps the seeded rows of", () => {
    const body = SHOWCASE.slice(SHOWCASE.indexOf("insert into demo_kept_rows"), SHOWCASE.indexOf("-- The key of a row"));
    expect([...body.matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]).sort()).toEqual(demoKeptRowTables().sort());
  });

  it("get the words trigger on every table that holds words", () => {
    const attached = SHOWCASE.slice(SHOWCASE.indexOf("foreach t in array array["), SHOWCASE.indexOf("loop", SHOWCASE.indexOf("foreach t in array array[")));
    const tables = new Set([...attached.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    for (const [table, t] of Object.entries(DEMO_WORDS_COLUMNS)) {
      if (t.words.length > 0 || (t.kept ?? []).length > 0) expect(tables.has(table), `${table} holds words but has no words trigger`).toBe(true);
    }
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
    expect(protectedRefusal({ code: "ZF4D2" })).toBeInstanceOf(DemoShowcase);
    expect(protectedRefusal({ code: "ZF4D3" })).toBeInstanceOf(DemoSeededWords);
    for (const e of [{ code: "ZF4D0" }, { code: "ZF4D1" }, { code: "23505" }, {}, null, undefined, "ZF4D2"]) expect(protectedRefusal(e)).toBeNull();
  });
});
