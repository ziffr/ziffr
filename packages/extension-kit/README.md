# @ziffr/extension-kit

Write and check a [Ziffr](https://github.com/ziffr/ziffr) Extension: one new Method or one new mark, written by someone other than Ziffr as a small TypeScript module Ziffr can read in full. An Extension is never loaded at run time. It is submitted, read line by line, checked, and shipped inside a Ziffr release. MIT licensed, Node 20 or later.

This first version checks an Extension's **shape** and its **static rules**. The checks that run the code (determinism, budgets, the reference comparison, coverage and mutation, the refusals) come next.

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

`test/good/example` in the repository is a complete one, and `test/bad/` holds the Extensions the checks must refuse, each for exactly one named reason.

## Check an Extension

```sh skip="installs a package and needs an Extension folder of your own"
npx @ziffr/extension-kit check ./my-extension
```

```text
./my-extension: acme/spread 1.0.0 has the right shape and passes the static rules.
```

Each problem names its file and line, and the command ends with 1:

```text
./my-extension/method.ts:7: uses “Date”, which an Extension may not.
./my-extension/wording.ts:3: says “because”, which a Takeaway never says.
```

## The static rules

They run on the TypeScript syntax tree, not on text patterns, in every `.ts` file of the folder:

- **Imports:** only `@ziffr/extension-kit` and `@ziffr/figures`, by exactly those names. No relative file, no Node module, no dynamic `import()`, no `require`.
- **Forbidden identifiers:** `Date`, `Math.random` (the rest of `Math` is fine), `process`, `globalThis`, `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, `Function`, `require`, `setTimeout` (and `setInterval`, `setImmediate`). They are refused however they are written: aliased, taken out of an object, as a type, or with an escape.
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
