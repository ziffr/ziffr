// The Snowflake driver without a network or an account (spec 0048, ticket #911): a hand-written fake connection
// shows how queries are bound, limited and refused, and how the connection opens and closes.
import { describe, expect, it } from "vitest";
import { connect, type SnowflakeSdk } from "./snowflake";

const env = { SNOWFLAKE_ACCOUNT: "org-acct", SNOWFLAKE_USER: "FEED", SNOWFLAKE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----" };

function fake(rows: Record<string, unknown>[] = [{ V: 1 }], loginError?: Error) {
  const log = { options: undefined as Record<string, unknown> | undefined, executed: [] as { sqlText: string; binds?: string[]; parameters?: Record<string, number> }[], connected: 0, destroyed: 0 };
  const sdk: SnowflakeSdk = {
    createConnection: (options) => {
      log.options = options;
      return {
        connect: (cb) => { log.connected++; cb(loginError, undefined); },
        execute: (o) => { log.executed.push({ sqlText: o.sqlText, binds: o.binds, parameters: o.parameters }); o.complete(undefined, undefined, rows); },
        destroy: (cb) => { log.destroyed++; cb(undefined, undefined); },
      };
    },
  };
  return { sdk, log };
}

describe("snowflake connect", () => {
  it("logs in with the key pair, runs a bound query with a statement timeout and closes", async () => {
    const { sdk, log } = fake([{ V: 42 }]);
    const db = await connect({ warehouse: "SMALL_WH", statement_timeout_ms: 45_000 }, { ...env, SNOWFLAKE_ROLE: "FEED_RO", SNOWFLAKE_PRIVATE_KEY_PASSPHRASE: "pw" }, sdk);
    expect(log.options).toMatchObject({ account: "org-acct", username: "FEED", authenticator: "SNOWFLAKE_JWT", privateKeyPass: "pw", warehouse: "SMALL_WH", role: "FEED_RO", sessionParams: { STATEMENT_TIMEOUT_IN_SECONDS: 45, MULTI_STATEMENT_COUNT: 1 } });
    expect(String(log.options?.privateKey)).toContain("\nabc\n");
    expect(await db.query("select sum(x) from t where d >= :1 and d < :2", ["2026-01-01", "2026-02-01"])).toEqual([{ V: 42 }]);
    expect(log.executed).toEqual([{ sqlText: "select sum(x) from t where d >= :1 and d < :2", binds: ["2026-01-01", "2026-02-01"], parameters: { STATEMENT_TIMEOUT_IN_SECONDS: 45, MULTI_STATEMENT_COUNT: 1 } }]);
    await db.close();
    expect([log.connected, log.destroyed]).toEqual([1, 1]);
  });
  it("defaults to 30 seconds and takes the warehouse from the environment", async () => {
    const { sdk, log } = fake();
    await connect({}, { ...env, SNOWFLAKE_WAREHOUSE: "ENV_WH" }, sdk);
    expect(log.options).toMatchObject({ warehouse: "ENV_WH", sessionParams: { STATEMENT_TIMEOUT_IN_SECONDS: 30, MULTI_STATEMENT_COUNT: 1 } });
  });
  it("accepts a WITH ... SELECT, comments and a trailing semicolon", async () => {
    const { sdk, log } = fake();
    const db = await connect({}, env, sdk);
    await db.query("-- total\nwith a as (select 1 as v) select v from a;", []);
    await db.query("select 'a;b' as v /* x; y */", []);
    expect(log.executed).toHaveLength(2);
  });
  it("refuses anything but a single select and never runs it", async () => {
    const { sdk, log } = fake();
    const db = await connect({}, env, sdk);
    for (const text of ["drop table t", "delete from t", "insert into t values (1)", "call p()", "copy into t from @s", "select 1; drop table t", "select 1; select 2", "with a as (select 1) delete from t", "", "-- only a comment"]) {
      await expect(db.query(text, [])).rejects.toThrow(/SELECT|statement/);
    }
    expect(log.executed).toEqual([]);
  });
  it("refuses the known bypasses: CALL, a write inside WITH, $$ blocks, a statement after a comment", async () => {
    const { sdk, log } = fake();
    const db = await connect({}, env, sdk);
    for (const text of ["call my_proc()", "with a as (select 1) insert into t select * from a", "select 1 $$ select 2 $$", "with p as procedure () returns int language sql as $$ begin return 1; end $$ call p()", "select 1 -- done\n; drop table t", "select 1 /* x */ ; /* y */ delete from t", "select 1 where x in (select get(y) from z)"]) {
      await expect(db.query(text, [])).rejects.toThrow(/SELECT|statement|\$\$/);
    }
    expect(log.executed).toEqual([]);
  });
  it("lets quoted strings and identifiers hold those words", async () => {
    const { sdk, log } = fake();
    const db = await connect({}, env, sdk);
    await db.query("select 'call; drop table t $$ insert' as note, \"update\" from t where label = 'copy'", []);
    expect(log.executed).toHaveLength(1);
  });
  it("says in words what is missing for the key-pair login", async () => {
    const { sdk } = fake();
    await expect(connect({}, { ...env, SNOWFLAKE_ACCOUNT: "" }, sdk)).rejects.toThrow(/SNOWFLAKE_ACCOUNT/);
    await expect(connect({}, { ...env, SNOWFLAKE_USER: undefined }, sdk)).rejects.toThrow(/SNOWFLAKE_USER/);
    await expect(connect({}, { SNOWFLAKE_ACCOUNT: "a", SNOWFLAKE_USER: "u" }, sdk)).rejects.toThrow(/SNOWFLAKE_PRIVATE_KEY/);
    await expect(connect({}, { SNOWFLAKE_ACCOUNT: "a", SNOWFLAKE_USER: "u", SNOWFLAKE_PRIVATE_KEY_PATH: "/nonexistent/key.p8" }, sdk)).rejects.toThrow(/could not be read/);
  });
  it("reports a failed login", async () => {
    const { sdk } = fake([], new Error("JWT token is invalid"));
    await expect(connect({}, env, sdk)).rejects.toThrow(/Snowflake login failed: JWT token is invalid/);
  });
});
