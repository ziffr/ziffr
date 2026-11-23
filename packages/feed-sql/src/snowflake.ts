// The SQL Feed's Snowflake driver (spec 0048, GLOSSARY: Feed): opens a read-only runner on Snowflake with key-pair
// login taken from the environment, so the Feed's file holds no secret. Every query is bound with numbered binds
// (`:1`, `:2`), runs with a statement timeout, and is refused unless it is one single SELECT statement. The vendor
// library `snowflake-sdk` is an optional peer dependency, loaded only here.
import { readFile } from "node:fs/promises";
import type { SqlRunner } from "./index.js";

/** The part of a snowflake-sdk connection this driver uses (declared here so the package need not be installed to build). */
type SnowflakeConnection = {
  connect: (cb: (err: Error | undefined, conn: unknown) => void) => void;
  execute: (opts: { sqlText: string; binds?: string[]; parameters?: Record<string, number>; complete: (err: Error | undefined, stmt: unknown, rows: Record<string, unknown>[] | undefined) => void }) => unknown;
  destroy: (cb: (err: Error | undefined, conn: unknown) => void) => void;
};

/** The part of the snowflake-sdk module this driver uses; replaced by a fake in tests. */
export type SnowflakeSdk = { createConnection: (options: Record<string, unknown>) => SnowflakeConnection };

/** What a Snowflake Feed file may say besides its queries: names only, never a secret. */
type SnowflakeConfig = { warehouse?: string; role?: string; database?: string; schema?: string; statement_timeout_ms?: number };

/** Removes comments and ordinary quoted strings and identifiers, so the checks see only the statement's own words. A `$$` block is not removed: it is refused. */
function skeleton(sql: string): string {
  return sql.replace(/--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\[\s\S]|'')*'|"(?:[^"]|"")*"/g, " ");
}

/** Words that never belong in a Feed's query; a whole-word match outside quoted strings refuses it. */
const FORBIDDEN = /\b(call|procedure|execute|copy|put|get|create|alter|drop|grant|insert|update|delete|merge|truncate)\b/i;

/** Throws unless the text is one SELECT (or WITH ... SELECT) statement; a trailing semicolon is the only one allowed.
 * An allowlist of shape and words, a backup to the read-only role and to MULTI_STATEMENT_COUNT=1 (the server refuses batches). */
function assertSingleSelect(sql: string): void {
  const body = skeleton(sql).trim().replace(/;\s*$/, "");
  if (body.includes("$$")) throw new Error("A $$ block is not allowed in a Feed's query.");
  if (body.includes(";")) throw new Error("Only one statement may run: remove the semicolon-separated statements.");
  const first = /^[\s(]*([a-z]+)/i.exec(body)?.[1]?.toLowerCase();
  if (first !== "select" && first !== "with") throw new Error(`Only a single SELECT statement may run on Snowflake, not ${first ? first.toUpperCase() : "an empty or unreadable statement"}.`);
  const word = FORBIDDEN.exec(body)?.[1];
  if (word) throw new Error(`Only a single SELECT statement may run on Snowflake: the word ${word.toUpperCase()} is not allowed in a query.`);
  if (first === "with" && !/\bselect\b/i.test(body)) throw new Error("A WITH query must end in a SELECT.");
}

/** Seconds for Snowflake's STATEMENT_TIMEOUT_IN_SECONDS from the file's milliseconds (at least 1, at most 10 minutes). */
function timeoutSeconds(ms: number | undefined): number {
  return Math.max(1, Math.min(Math.ceil((Number(ms) || 30_000) / 1000), 600));
}

/** The private key from SNOWFLAKE_PRIVATE_KEY (the PEM text) or SNOWFLAKE_PRIVATE_KEY_PATH (a file), in words when neither is set. */
async function privateKey(env: Record<string, string | undefined>): Promise<string> {
  const pem = env.SNOWFLAKE_PRIVATE_KEY?.trim();
  if (pem) return pem.replace(/\\n/g, "\n");
  const path = env.SNOWFLAKE_PRIVATE_KEY_PATH?.trim();
  if (!path) throw new Error("Snowflake needs a private key: set SNOWFLAKE_PRIVATE_KEY (the PEM text) or SNOWFLAKE_PRIVATE_KEY_PATH (a file).");
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new Error(`The private key file in SNOWFLAKE_PRIVATE_KEY_PATH could not be read (${path}).`);
  }
}

/** Opens a Snowflake runner: key-pair login from the environment (SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, the private
 * key, optional SNOWFLAKE_PRIVATE_KEY_PASSPHRASE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE; the file's names win). `sdk`
 * is replaced in tests. */
export async function connect(config: Record<string, unknown>, env: Record<string, string | undefined>, sdk?: SnowflakeSdk): Promise<SqlRunner> {
  const c = config as SnowflakeConfig;
  const account = env.SNOWFLAKE_ACCOUNT?.trim();
  const username = env.SNOWFLAKE_USER?.trim();
  if (!account) throw new Error("Snowflake needs an account: set SNOWFLAKE_ACCOUNT (for example myorg-myaccount).");
  if (!username) throw new Error("Snowflake needs a user: set SNOWFLAKE_USER.");
  const key = await privateKey(env);
  const seconds = timeoutSeconds(c.statement_timeout_ms);
  const lib = sdk ?? await loadSdk();
  const conn = lib.createConnection({
    account, username, authenticator: "SNOWFLAKE_JWT", privateKey: key,
    ...(env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE ? { privateKeyPass: env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE } : {}),
    warehouse: c.warehouse ?? env.SNOWFLAKE_WAREHOUSE, role: c.role ?? env.SNOWFLAKE_ROLE, database: c.database, schema: c.schema,
    // Also a session parameter, so a statement cannot outlive the limit even if a per-statement one is dropped.
    sessionParams: { STATEMENT_TIMEOUT_IN_SECONDS: seconds, MULTI_STATEMENT_COUNT: 1 },
  });
  await new Promise<void>((resolve, reject) => conn.connect((err) => (err ? reject(new Error(`Snowflake login failed: ${err.message}`)) : resolve())));
  return {
    query: async (text, params) => {
      assertSingleSelect(text);
      // The period goes in as bound values only; the text is the file's own query.
      return new Promise((resolve, reject) => conn.execute({ sqlText: text, binds: params, parameters: { STATEMENT_TIMEOUT_IN_SECONDS: seconds, MULTI_STATEMENT_COUNT: 1 }, complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows ?? [])) }));
    },
    close: () => new Promise<void>((resolve) => conn.destroy(() => resolve())),
  };
}

/** Loads the optional vendor package; the module may be CommonJS (its exports under `default`). */
async function loadSdk(): Promise<SnowflakeSdk> {
  let mod: SnowflakeSdk & { default?: SnowflakeSdk };
  try {
    mod = (await import(/* @vite-ignore */ "snowflake-sdk" as string)) as typeof mod;
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND") throw new Error("The snowflake dialect needs the optional package snowflake-sdk. Install it next to @ziffr/feed-sql (npm install snowflake-sdk) and run again.");
    throw e;
  }
  return typeof mod.createConnection === "function" ? mod : mod.default!;
}
