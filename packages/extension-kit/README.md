# @ziffr/extension-kit

Write and check a [Ziffr](https://github.com/ziffr/ziffr) Extension: one new Method or one new mark, written by someone other than Ziffr as a small TypeScript module Ziffr can read in full. An Extension is never loaded at run time. It is submitted, read line by line, checked, and shipped inside a Ziffr release. MIT licensed, Node 20 or later.

`check` looks at an Extension's **shape** and its **static rules**, and then, when those pass, **runs its code** to see what it does: determinism, a time and memory budget, the refusals, the comparison with the reference, path coverage and a mutation check. A mark's code is not run yet; that comes with marks.

## An Extension is a folder

| File | What |
| --- | --- |
| `extension.json` | The manifest, format `ziffr.extension/1`: id (`author/name`), version, kind (`method` or `mark`), author, licence, signature, limits, the Ziffr it was written for, price (`free`). Its schema, `docs/reference/extension.schema.json` in the repository, is generated from the checks. |
| `method.ts` or `mark.ts` | The implementation, at most 400 lines. |
| `reference.ts` | A second implementation, worked out another way, sharing nothing with the first. |
| `cases.ts` | Hand-worked cases. |
| `catalogue.md` | The Calculation Catalogue row: the rule, its assumptions, its minimum data, when not to use it. |
| `wording.ts` | The Takeaway sentences. |
| `LICENSE` | The licence of this folder: MIT or Apache-2.0, the one the manifest names. |

`test/good/example` in the repository is a complete one, and so are the two built into Ziffr, `extensions/ziffr/quantile` and `extensions/ziffr/top-share`, which the Kit's own tests hold to every check below (mutation included).  and `test/bad/` holds the Extensions the checks must refuse, each for exactly one named reason.

## Check an Extension

```sh skip="installs a package and needs an Extension folder of your own"
npx @ziffr/extension-kit check ./my-extension
```

```text
./my-extension: acme/spread 1.0.0 passes every check: shape, static rules, determinism, budget, refusals, reference, coverage and mutation.
```

Each problem names its file and line, or the case it was found on, and the command ends with 1:

```text
./my-extension/method.ts:7: uses “Date”, which an Extension may not.
./my-extension/wording.ts:3: says “because”, which a Takeaway never says.
./my-extension/method.ts: returned 0 on a flat series instead of refusing: a flat, empty, too short or non-numeric series has no answer, and the Method must say so in words.
```

`check ./my-extension --static` stops after the shape and the static rules; nothing in the folder is run. The same command gives the same answer on a laptop and in CI: the generated inputs come from a fixed seed (115, as the core's tests), and the limits below are the same everywhere.

## The static rules

They run on the TypeScript syntax tree, not on text patterns, in every `.ts` file of the folder:

- **Imports:** only `@ziffr/extension-kit` and `@ziffr/figures`, by exactly those names. No relative file, no Node module, no dynamic `import()`, no `require`.
- **Only a short list of globals:** a name the file did not declare or import is refused unless it is `Math` (not `Math.random`), `Number`, `String`, `Boolean`, `Array`, `Object` (only `keys`, `values`, `entries`, `freeze` and `fromEntries`), `JSON`, `Map`, `Set`, `BigInt`, `Infinity`, `NaN`, `undefined`, `isFinite`, `isNaN`, `parseFloat`, `parseInt`, `Symbol`, `Error`, `RangeError`, `TypeError` or a type name the compiler provides. So `Date`, `performance`, `crypto`, `process`, `globalThis`, `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, `Function`, `require`, `setTimeout`, `WebAssembly`, `Worker` and everything else are refused, however they are written: aliased, taken out of an object, as a type, or with an escape.
- **Nothing that depends on the machine's language settings:** `Intl`, `localeCompare`, `toLocaleString` and the other `toLocale…` methods.
- **No `this`.** An Extension is a function of its arguments.
- **No state at the top of `method.ts`, `mark.ts` and `reference.ts`:** no `let` or `var`, and a top-level `const` holding a list, object, Map or Set must be `as const`, `Object.freeze(…)` or have a readonly type. Calling `push`, `sort`, `set` and the like on the input or on anything outside the function is refused (copy first).
- **No property reached by a string:** `x["name"]`, a key built from pieces or kept in a constant, and `constructor`, `prototype` and `__proto__`, which lead back to `Function`.
- **No `any`:** not as a type, in a generic or in an assertion.
- **No assignment outside the function:** to a name the function did not declare, to a module variable or object, to `this`, or to what the caller handed in.
- **`wording.ts`:** no Takeaway says cause, because, significant, p-value, regression, R², coefficient or confidence.

These are a first line, not a security boundary: the person who reads every line of an Extension is the boundary. Where a rule cannot decide, it refuses.

## In a program

```js skip="a fragment: files is a Map of the folder's paths to their text"
import { checkExtensionFiles, readExtensionFolder } from "@ziffr/extension-kit";

const problems = checkExtensionFiles(readExtensionFolder("./my-extension"));
```

## The checks that run the code

They run only on a Method that passed the shape and the static rules, and never in the checker's own process. Each one gives a named reason, and the reasons are independent, so a bad Extension is refused for one.

### What the checks expect of a Method

- `method.ts` exports **one function** (or a `default` one). It is called with the signature's inputs in order, then its parameters (their defaults), and gives a number, a refusal (`refuse("…")`) or other plain data: lists and objects of numbers, text, booleans and null, at most 1 MB.
- `reference.ts` exports `reference` (or one function), the same signature, worked out another way.
- `cases.ts` exports `cases`: each case has a `name`, an `input` (or `args`, the list of all inputs, and `params`) and either `expected` (the answer worked out by hand) or `refused` (the words of its refusal).
- `extension.json` may name how answers are compared: left out, they must be exactly equal; `"equality": { "relative": 1e-9 }` accepts a relative difference of that much (at most 1e-6), for a Method that draws on a distribution.

### What each check does

| Check | How | Reasons |
| --- | --- | --- |
| Determinism | Every input runs twice in two fresh processes, and the answers must be the same bytes. The clock (`Date`, `performance`, `process.hrtime`), the random generator (`Math.random`, `crypto`) and the timers are replaced by stubs that throw. | `nondeterministic`, `forbidden-at-run` |
| Budget | A series of the manifest's longest length (at most 120 points) made of the worst inputs: constant, alternating, huge, tiny, mixed, all NaN, all Infinity, rising, falling, random-looking. One call may take 1 second and the process 128 MB of heap (and 512 MB in all). An endless loop or runaway memory is killed and reported, and the checker goes on. | `too-slow`, `too-much-memory`, `threw`, `bad-answer`, `not-runnable` |
| Refusals | A flat series, one with NaN, an empty one and one of a single value must each be a refusal in words, never a number. | `no-refusal` |
| Reference | The Method and the reference on every hand case and on 200 generated inputs ([fast-check](https://fast-check.dev): series and numbers, with ties, huge values and a few non-numbers), and each hand case against both. A reference that imports the same function from `@ziffr/figures` as the Method, or repeats a function of it under other names, is refused. | `differs-from-reference`, `differs-from-case`, `reference-shares-code`, `bad-cases` |
| Coverage | V8's block coverage of `method.ts` over every input above must be 100 %: each branch, each condition, each function. The report names the line of the code that never ran. | `uncovered-code` |
| Mutation | [Stryker](https://stryker-mutator.io) changes `method.ts` on purpose (a `<` into `<=`, a `+` into `-`, a text into an empty one) and the answers must differ from the right ones for every change, as `docs/guides/calculation-tests.md` asks of Ziffr's own calculations. A change nothing notices is named with its line: add the case that notices it, or take out the code that does nothing. It runs last, only when everything else passed, and is the slow one. | `mutant-survived`, `mutation-not-run` |

### A safety net, not a sandbox

An Extension is **untrusted code run on the author's machine and in CI**, and the Kit takes care with that, but it is not a sandbox and does not claim to be one. What protects Ziffr is that a person reads every line before an Extension ships. What the Kit does: it runs the code only in a child process with a hard time limit per call and in all, a heap limit (`--max-old-space-size`) and a memory ceiling watched from outside, no environment variables, a new temporary directory as its working directory, no standard input or output (only one channel for JSON lines, whose size and number are capped), `eval` and `new Function` switched off (in the mutation check too), the clock, the random generator, timers, `fetch`, `net`, `http`, `dns`, `child_process`, workers and writing files replaced by stubs that throw, and the input frozen. On a Node whose permission model has `--allow-inspector` (the coverage check needs it) it also turns that model on: the process may read only its own temporary directory and the Kit's runner, and may not write a file, start a process or a worker, or (where Node has `--allow-net`) open a connection. When the mutation check runs out of time, Stryker and every process under it are killed. What it does not do: stop code on an older Node from reading files, stop code from using what a stub missed, or from a bug in Node; and a run the checker could not finish (the checker itself killed) may leave a temporary directory behind. Run an Extension you have not read in a container or a virtual machine, as with any code from someone else.

### In a program

```js skip="a fragment: files is a Map of the folder's paths to their text, manifest is its checked manifest"
import { runChecks } from "@ziffr/extension-kit";

const problems = await runChecks(files, manifest, { generated: 200, seed: 115, mutation: true });
```
