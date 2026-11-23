// Runs an Extension's code in a process of its own (GLOSSARY: Extension Kit). `prepareExtension` writes the Extension,
// compiled from TypeScript by the checker, into a fresh temporary directory; `runChild` starts `child.js` there with a
// hard time limit, a memory limit, no environment, no input and one result channel, and reads what it sends back.
// The checker never loads, evaluates or imports an Extension's code itself. This is a safety net and not a sandbox.
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, "child.js");
const require = createRequire(import.meta.url);

/** The limits every run has unless a caller sets another: milliseconds, megabytes and bytes. */
export const LIMITS = {
  /** The most one call of an Extension may take, measured inside the process; the watchdog adds a grace period. */
  perCallMs: 1000,
  /** The most a whole run may take: loading, every call and the report. */
  totalMs: 60_000,
  /** V8's heap ceiling for the process (`--max-old-space-size`). */
  heapMb: 128,
  /** The most the whole process may hold in memory, checked from outside every 100 ms where `ps` exists. */
  rssMb: 512,
  /** The longest line the process may send, and the most it may send in all. */
  maxLineBytes: 2_097_152,
  maxTotalBytes: 16_777_216,
};

const GRACE_MS = 500;
const FLAGS = process.allowedNodeEnvironmentFlags;
// Node's permission model, where this Node has it with the inspector switch the coverage run needs:
// the process may then read only its own directory and this one, and may not write a file, start a process or a worker,
// load an addon or, where Node knows `--allow-net`, open a connection. Older Nodes rely on the stubs alone.
const PERMISSION = FLAGS.has("--permission") && FLAGS.has("--allow-inspector");
// Real paths throughout: on macOS the temporary directory is a link, and both V8 and the permission model go by where a file really is.
const REAL_HERE = realpathSync(HERE);
const FILES = ["method.ts", "mark.ts", "reference.ts", "cases.ts"];
/** What `@ziffr/extension-kit` is at run time: `refuse` and nothing else, written the way `types.ts` writes it. */
const KIT_STUB = "export const refuse = (reason) => ({ refused: reason });\n";
let jobs = 0;

/** Compiles one TypeScript file to JavaScript and a source map, pointing its two allowed imports at the stubs beside it. */
function compile(name, text) {
  const res = ts.transpileModule(text, {
    fileName: name,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, sourceMap: true, inlineSources: false, removeComments: false },
  });
  const rewrite = (m) => `${m[1]}${m[2]}./${m[3] === "@ziffr/figures" ? "figures" : "kit"}.js${m[2]}`;
  const js = res.outputText
    .replace(/\n\/\/# sourceMappingURL=.*$/, "\n")
    .replace(/^((?:import|\}|export)[^\n]*?\bfrom\s+)(["'])(@ziffr\/figures|@ziffr\/extension-kit)\2/gm, (...m) => rewrite(m));
  return { js, map: res.sourceMapText ?? "" };
}

/** The text of `@ziffr/figures` as it is installed, which is the only package an Extension may use besides the Kit. */
function figuresSource() {
  return readFileSync(require.resolve("@ziffr/figures"), "utf8");
}

/**
 * Writes an Extension's TypeScript files, compiled, into a new temporary directory with the two stubs it may import.
 * @param {ReadonlyMap<string, string>} files the Extension's files by path; only the ones that are code are used
 * @returns {{ dir: string, compiled: Map<string, { js: string, map: string }>, cleanup: () => void }}
 */
export function prepareExtension(files) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ziffr-ext-")));
  const compiled = new Map();
  try {
    writeFileSync(join(dir, "kit.js"), KIT_STUB);
    writeFileSync(join(dir, "figures.js"), compile("figures.ts", figuresSource()).js);
    for (const f of FILES) {
      const text = files.get(f);
      if (text === undefined) continue;
      const out = compile(f, text);
      compiled.set(f, out);
      writeFileSync(join(dir, f.replace(/\.ts$/, ".js")), out.js);
    }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return { dir, compiled, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Runs one job in a fresh process and reads its lines. A job is `{ op: "run" | "cases", file, prefer, inputs, coverage }`.
 * `onEvent` sees each line as it arrives and may return true to stop the run at once.
 * @param {{ dir: string }} prepared what `prepareExtension` returned
 * @param {object} job what to run
 * @param {Partial<typeof LIMITS> & { onEvent?: (event: any) => boolean | void, maxEvents?: number, mutant?: string }} [options] limits, the watcher, the most lines (two per input and four by default) and Stryker's active change
 * @returns {Promise<{ end: "done" | "fatal" | "timeout" | "memory" | "output" | "garbage" | "crash" | "aborted", at: number | null, events: any[], detail: string }>}
 */
export function runChild(prepared, job, options = {}) {
  const limits = { ...LIMITS, ...options };
  const jobFile = `job-${jobs++}.json`;
  writeFileSync(join(prepared.dir, jobFile), JSON.stringify(job));
  // A begin and an answer for each input, then the end: a process that sends more lines is not the child.js this file wrote.
  const maxEvents = options.maxEvents ?? 2 * (Array.isArray(job.inputs) ? job.inputs.length : 0) + 4;
  const permission = PERMISSION
    ? ["--permission", ...[prepared.dir, REAL_HERE].map((p) => `--allow-fs-read=${p}`), ...(job.coverage ? ["--allow-inspector"] : [])]
    : [];
  return new Promise((resolve) => {
    // No environment, no input, nothing printed: the only way out is descriptor 3, which this function reads. Code made
    // from a string stays off in the mutation run too: Stryker's header reaches for `new Function` only where there is no
    // `globalThis`, and Node always has one.
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${limits.heapMb}`, "--disallow-code-generation-from-strings", ...permission, "--no-warnings", CHILD, prepared.dir, jobFile],
      // The environment is empty, except in a run of the mutation check, which needs to tell Stryker's instrumentation which change is on.
      { cwd: prepared.dir, env: job.stryker === true && limits.mutant ? { __STRYKER_ACTIVE_MUTANT__: limits.mutant } : {}, stdio: ["ignore", "ignore", "pipe", "pipe"], windowsHide: true },
    );
    /** @type {any[]} */
    const events = [];
    let killedFor = "";
    let at = /** @type {number | null} */ (null);
    let pending = "";
    let total = 0;
    let stderr = "";
    let seen = null;
    let watchdog = /** @type {NodeJS.Timeout | undefined} */ (undefined);
    const kill = (why) => {
      if (killedFor) return;
      killedFor = why;
      child.kill("SIGKILL");
    };
    const overall = setTimeout(() => kill("timeout"), limits.totalMs);
    // One `ps` at a time: on a busy machine a slow one must not pile up behind the next.
    let asking = false;
    const poll = process.platform === "win32" ? undefined : setInterval(() => {
      if (asking || killedFor) return;
      asking = true;
      execFile("/bin/ps", ["-o", "rss=", "-p", String(child.pid)], { env: {}, timeout: 2000 }, (err, out) => {
        asking = false;
        if (!err && Number.parseInt(out, 10) / 1024 > limits.rssMb) kill("memory");
      });
    }, 100);

    const handle = (line) => {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        kill("garbage");
        return;
      }
      if (typeof ev !== "object" || ev === null) return kill("garbage");
      if ("begin" in ev) {
        at = ev.begin;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => kill("timeout"), limits.perCallMs + GRACE_MS);
      } else if ("i" in ev) {
        clearTimeout(watchdog);
        seen = ev.i;
      }
      events.push(ev);
      if (events.length > maxEvents) return kill("output");
      // A watcher that throws on a line it did not expect must not leave the process running behind it.
      let stop;
      try {
        stop = limits.onEvent?.(ev);
      } catch {
        return kill("garbage");
      }
      if (stop === true) kill("aborted");
    };

    const channel = /** @type {import("node:stream").Readable} */ (child.stdio[3]);
    channel.setEncoding("utf8");
    channel.on("data", (chunk) => {
      total += chunk.length;
      pending += chunk;
      if (total > limits.maxTotalBytes) return kill("output");
      let nl = pending.indexOf("\n");
      while (nl >= 0 && !killedFor) {
        handle(pending.slice(0, nl));
        pending = pending.slice(nl + 1);
        nl = pending.indexOf("\n");
      }
      if (pending.length > limits.maxLineBytes) kill("output");
    });
    channel.on("error", () => undefined);
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk;
    });
    child.on("error", () => kill("crash"));
    child.on("close", (code, signal) => {
      clearTimeout(overall);
      clearTimeout(watchdog);
      if (poll) clearInterval(poll);
      const last = events[events.length - 1];
      let end;
      let detail = "";
      if (killedFor) end = killedFor;
      else if (last && last.done) end = "done";
      else if (last && last.fatal) {
        end = "fatal";
        detail = last.fatal;
      } else if (/heap out of memory|allocation failed|invalid array length|invalid string length/i.test(stderr)) end = "memory";
      else {
        end = "crash";
        detail = `the process ended with ${signal ?? `code ${code}`} before it finished${stderr.trim() ? ` (${stderr.trim().split("\n").slice(0, 3).join(" ").slice(0, 300)})` : ""}`;
      }
      if (end === "done" && at !== null && seen !== at) end = "crash";
      resolve({ end: /** @type {any} */ (end), at: end === "done" ? null : at, events, detail });
    });
  });
}

/** The process ids under `pid`, `pid` among them, from one listing of every process. */
function treeOf(pid) {
  const under = new Map();
  for (const row of execFileSync("/bin/ps", ["-A", "-o", "pid=,ppid="], { env: {}, timeout: 5000, encoding: "utf8" }).split("\n")) {
    const [p, pp] = row.trim().split(/\s+/).map(Number);
    if (p > 0) under.set(pp, [...(under.get(pp) ?? []), p]);
  }
  const out = [pid];
  for (let i = 0; i < out.length; i++) out.push(...(under.get(out[i]) ?? []).filter((p) => !out.includes(p)));
  return out;
}

/**
 * Kills a process and every process it started, however deep: SIGKILL to one process leaves its children running, and a
 * test runner (Stryker) has a child per change, each with a child of its own. The tree is stopped first so that nothing in
 * it can start another process between the listing and the kill.
 * @param {number | undefined} pid the process at the top
 */
export function killTree(pid) {
  if (!pid) return;
  const signal = (pids, sig) => {
    for (const p of pids) {
      try {
        process.kill(p, sig);
      } catch {
        // Gone already.
      }
    }
  };
  if (process.platform === "win32") return signal([pid], "SIGKILL");
  let pids = [pid];
  try {
    pids = treeOf(pid);
    signal(pids, "SIGSTOP");
    pids = [...new Set([...pids, ...treeOf(pid)])];
  } catch {
    // Without a listing, the top process at least.
  }
  signal(pids, "SIGKILL");
}
