// The core's database access (spec 0001: one core). Only core functions use the service role, after checking who
// acts and in which Workspace; Row Level Security stays on with no policies, so nothing else can read the tables.
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_READ_ONLY_CODE, DemoReadOnly } from "./demo";

let client: SupabaseClient | null = null;
let seedClient: SupabaseClient | null = null;
const seeding = new AsyncLocalStorage<true>();

/** Whether a database error is its refusal of a write to the demo. */
const isDemoRefusal = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === DEMO_READ_ONLY_CODE;

// Demo Mode is read-only (#271): the database refuses every write to the demo with one code, and here, where every
// query passes, that refusal is thrown as DemoReadOnly. Core functions mostly turn `{ error }` into words of their own
// ("could not be saved"); thrown, the person reads why instead, whichever function tried.
function guarded<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj);
      if (typeof value !== "function") return value;
      if (prop === "then") {
        return (onDone?: (v: unknown) => unknown, onFail?: (e: unknown) => unknown) =>
          (value as (a: unknown, b: unknown) => Promise<unknown>)
            .call(
              obj,
              (r: unknown) => {
                if (isDemoRefusal((r as { error?: unknown } | null)?.error)) throw new DemoReadOnly();
                return r;
              },
              (e: unknown) => {
                throw isDemoRefusal(e) ? new DemoReadOnly() : e;
              },
            )
            .then(onDone, onFail);
      }
      // Each step of a query (insert, select, eq, single) returns the next builder, which stays guarded to the end.
      return (...args: unknown[]) => {
        const out: unknown = (value as (...a: unknown[]) => unknown).apply(obj, args);
        return out && typeof out === "object" && typeof (out as { then?: unknown }).then === "function" ? guarded(out) : out;
      };
    },
  });
}

function make(headers?: Record<string, string>): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the core.");
  const raw = createClient(url, key, { auth: { persistSession: false }, ...(headers ? { global: { headers } } : {}) });
  return new Proxy(raw, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj);
      // Every query of the core starts with from or rpc (none uses schema); the rest passes as it is.
      if (prop !== "from" && prop !== "rpc") return typeof value === "function" ? value.bind(obj) : value;
      return (...args: unknown[]) => guarded((value as (...a: unknown[]) => object).apply(obj, args));
    },
  });
}

/** The service-role client, made on first use from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Inside seedingDemo it
 * is the one client that may write the demo. */
export function db(): SupabaseClient {
  // The service role never runs in a browser: a client component importing this fails at once.
  if (typeof window !== "undefined") throw new Error("The core's database access runs on the server only.");
  if (seeding.getStore()) return (seedClient ??= make({ "x-ziffr-demo-seed": "on" }));
  return (client ??= make());
}

/** Runs the demo's own seed, the only work that writes the demo (after demo_reset: its Snapshots). Never for a
 * visitor: only the nightly job and the first start reach it, through resetDemoWorkspace. */
export function seedingDemo<T>(work: () => Promise<T>): Promise<T> {
  return seeding.run(true, work);
}
