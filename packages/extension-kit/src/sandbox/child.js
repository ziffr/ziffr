// The process that runs an Extension's code (GLOSSARY: Extension Kit). The checker starts it as `node child.js <dir> <job>`
// with no environment, in a temporary directory, with a memory limit and no input, and it is killed when it runs too
// long. It answers on file descriptor 3 only, one line of JSON at a time. This file is a safety net and not a sandbox:
// a person reads every line of an Extension before it ships, and the static rules refuse what it must not use. The net
// below stops an honest mistake (a clock read, a random number, a network call) from passing unseen.
import { readFileSync, realpathSync, writeSync } from "node:fs";
import inspector from "node:inspector";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { decode, encode } from "./wire.js";

const MAX_LINE = 1_048_576;
const MAX_RANGES = 20_000;
// What this file needs after the stubs are in place is taken first.
const nowNs = process.hrtime.bigint;
const write = writeSync;
const toBuffer = Buffer.from;
const exit = process.exit.bind(process);
const { Session } = inspector;
const require = createRequire(import.meta.url);

/** Writes one line of JSON on descriptor 3; a line that is too long is replaced by a note that it was. */
function send(obj) {
  let text = `${JSON.stringify(obj)}\n`;
  if (text.length > MAX_LINE) text = `${JSON.stringify({ i: obj.i, tooBig: true })}\n`;
  const buf = toBuffer(text);
  let at = 0;
  while (at < buf.length) {
    try {
      at += write(3, buf, at);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
    }
  }
}

/** A function that says it is not there: what the clock, the random generator and the network become. */
const thrower = (what) =>
  function () {
    throw new Error(`ZIFFR-STUB: ${what} is not available to an Extension`);
  };

/** Replaces the clock, the random generator, timers and the network with stubs that throw. */
function lockDown() {
  // Node loads some globals (fetch, for one) the first time they are read, and what it loads reads the clock: read them all now.
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    try {
      void globalThis[name];
    } catch {
      // A global that cannot be read is not one an Extension can use either.
    }
  }
  // Whatever the system put in the environment (the process was started with none) is taken out too.
  // Only in a run of the mutation check does one variable stay: the one that tells Stryker's instrumentation which change is on.
  for (const k of Object.keys(process.env)) if (!(job.stryker === true && k === "__STRYKER_ACTIVE_MUTANT__")) delete process.env[k];
  // The modules are loaded first, all of them: they load each other and the clock, and a stub in one would break the next.
  const loaded = ["net", "tls", "http", "https", "http2", "dns", "dns/promises", "dgram", "child_process", "cluster", "worker_threads", "vm", "inspector", "repl", "v8"].map((name) => [name, require(`node:${name}`)]);
  const Date = function Date() {
    throw new Error("ZIFFR-STUB: the clock is not available to an Extension");
  };
  for (const k of ["now", "parse", "UTC"]) Date[k] = thrower("the clock");
  globalThis.Date = Date;
  Math.random = thrower("the random generator");
  const everything = (what) => new Proxy({}, { get: thrower(what), has: thrower(what) });
  for (const [name, what] of [["performance", "the clock"], ["crypto", "the random generator"]]) Object.defineProperty(globalThis, name, { value: everything(what), configurable: true });
  for (const name of ["hrtime", "uptime", "cpuUsage", "resourceUsage", "memoryUsage", "binding", "dlopen", "kill", "chdir"]) process[name] = thrower(`process.${name}`);
  for (const name of ["setTimeout", "setInterval", "setImmediate", "queueMicrotask"]) globalThis[name] = thrower("a timer");
  for (const name of ["fetch", "WebSocket", "EventSource", "XMLHttpRequest", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "WebAssembly"]) Object.defineProperty(globalThis, name, { value: thrower(name), configurable: true });
  for (const [name, mod] of loaded) {
    for (const k of Object.keys(mod)) {
      try {
        if (typeof mod[k] === "function") mod[k] = thrower(`node:${name}`);
      } catch {
        // A property that cannot be replaced stays; the static rules refuse every import of a Node module anyway.
      }
    }
  }
  syncBuiltinESMExports();
}

/** Freezes a decoded argument all the way down: an Extension is handed its input and may not change it. */
function deepFreeze(v) {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

/** The one function an Extension file exports: its default export, else the one named `prefer`, else its only function. */
function pick(mod, prefer) {
  if (typeof mod.default === "function") return mod.default;
  if (typeof mod[prefer] === "function") return mod[prefer];
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
  return fns.length === 1 ? mod[fns[0]] : undefined;
}

/** The stretches of the loaded file's text that never ran, as [start, end) offsets, from V8's block coverage. */
function neverRan(scripts, url) {
  const script = scripts.find((s) => s.url === url);
  if (!script) return [];
  const ranges = script.functions.flatMap((f) => f.ranges.map((r) => ({ s: r.startOffset, e: r.endOffset, c: r.count })));
  if (ranges.length > MAX_RANGES) throw new Error("the coverage report is too large");
  const cuts = [...new Set(ranges.flatMap((r) => [r.s, r.e]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    let inner;
    for (const r of ranges) if (r.s <= a && r.e >= b && (!inner || r.e - r.s <= inner.e - inner.s)) inner = r;
    if (!inner || inner.c !== 0) continue;
    const last = out[out.length - 1];
    if (last && last[1] === a) last[1] = b;
    else out.push([a, b]);
  }
  return out;
}

const [dir, jobFile] = process.argv.slice(2);
const job = JSON.parse(readFileSync(join(dir, jobFile), "utf8"));
// The real path: on macOS the temporary directory is a link, and V8 names the script by where the file really is.
const fileUrl = pathToFileURL(realpathSync(join(dir, job.file))).href;

let session;
const post = (method, params) => {
  let result;
  let failure;
  session.post(method, params ?? {}, (e, r) => {
    failure = e;
    result = r;
  });
  if (failure) throw failure;
  return result;
};
if (job.coverage) {
  session = new Session();
  session.connect();
  post("Profiler.enable");
  post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
}

lockDown();

let mod;
try {
  mod = await import(fileUrl);
} catch (e) {
  send({ fatal: `could not be loaded: ${String(e && e.message).slice(0, 200)}` });
  exit(0);
}

if (job.op === "cases") {
  try {
    if (!Array.isArray(mod.cases)) throw new Error("does not export a list called cases");
    send({ i: 0, out: encode(mod.cases) });
    send({ done: true });
  } catch (e) {
    send({ fatal: `is not usable: ${String(e && e.message).slice(0, 200)}` });
  }
  exit(0);
}

const fn = pick(mod, job.prefer);
if (!fn) {
  send({ fatal: "must export exactly one function, or a default one" });
  exit(0);
}
for (let i = 0; i < job.inputs.length; i++) {
  send({ begin: i });
  let args;
  try {
    args = decode(job.inputs[i]).map(deepFreeze);
  } catch (e) {
    send({ i, threw: `the checker could not build this input: ${e.message}` });
    continue;
  }
  const t0 = nowNs();
  let out;
  let failure;
  try {
    out = fn(...args);
  } catch (e) {
    failure = e;
  }
  const ms = Number(nowNs() - t0) / 1e6;
  if (failure !== undefined) {
    send({ i, threw: String(failure && failure.message !== undefined ? failure.message : failure).slice(0, 200), ms });
    continue;
  }
  try {
    send({ i, out: encode(out), ms });
  } catch (e) {
    send({ i, bad: String(e.message).slice(0, 200), ms });
  }
}
let uncovered;
if (session) {
  try {
    uncovered = neverRan(post("Profiler.takePreciseCoverage").result, fileUrl);
  } catch (e) {
    send({ fatal: `coverage could not be read: ${String(e.message).slice(0, 200)}` });
    exit(0);
  }
}
send({ done: true, uncovered });
exit(0);
