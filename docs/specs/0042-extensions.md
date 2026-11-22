# 0042 Extensions: a method or a chart that someone else writes, Ziffr verifies and ships, and Packs can use

**Status:** in progress. **Tracking issue:** #711 (label `tracking`); tickets #712 to #720 carry `spec:0042`, in the order of the Tickets section. The owner's wish of 2026-11-22; the owner accepted the decisions the same day. Builds on spec 0024 (View Designs and Analysis Recipes), spec 0030 (Packs and the Marketplace), spec 0041 (the Methods and Marks it adds first) and ADR 0013 (no code from others runs inside Ziffr).

**Scope now:** tickets 1 to 3. Tickets 4 to 9 wait until someone outside asks to contribute a method (decision 6).

## Problem Statement

Packs let anyone share Metrics, dashboards, Themes, View Designs and Analysis Recipes, with no code (spec 0030). That is a real market, but it is a market in **arrangements**. What a Pack can draw and calculate is fixed by what Ziffr itself has built: eleven functions today, and a list of marks (spec 0024). A statistician who knows how to do survival analysis, a control chart or a Monte Carlo forecast, or a data-visualisation developer who can draw a Sankey diagram, has no way to add it, sell it or even offer it. They can only ask Ziffr, and Ziffr is one person.

ADR 0013 closed the obvious door, plugins that run others' code, and it was right: code in a browser or on the server sees every number it can reach and can send it anywhere; no review reliably tells harmless from harmful; and a number from unverified code breaks the promise of spec 0022 that every number Ziffr shows is verified. The decision stays. What is missing is a second door for people who can write a method, that does not run their code unseen.

## Solution

An **Extension** is one new function (a Method, in spec 0041's word) or one new mark, written by someone else as a small TypeScript module in a form Ziffr can check. It is **not loaded at run time.** It is submitted, read line by line by Ziffr, held to the same verification as Ziffr's own calculations, and then **shipped inside a Ziffr release** like any other function. After that it is a built-in: it runs in the same process, in the same way, with the same tests and the same catalogue row as `correlation` or `movingAverage`, and a Pack can use it by name.

So nothing changes about the safety argument of ADR 0013: no code from outside is ever run that Ziffr has not read, built and tested itself. What changes is who writes the code, and that the author is named, credited and, later, paid.

For the people who use them nothing changes at all: an Extension is a function in the library, and Analysis Recipes and View Designs reach it by name. The person who wants a Sankey diagram or a survival curve installs a Pack that uses it and gets a Takeaway or a chart (spec 0041). **Only the author of an Extension has to be a developer.** Everyone else, the Pack writers who compose Extensions and the people who install their Packs, is not.

For people who can describe what they want but cannot write it, there is a **Wanted list**: a short public list of Methods and marks that people have asked for, which anyone may vote on, and which an author may claim. It is how a non-developer, such as an analyst, steers what the developers build.

### Words

| Word | Meaning | Not |
| --- | --- | --- |
| **Extension** | A function or mark written by someone other than Ziffr, accepted after review and shipped in a release. It carries its author's name. | Plugin, add-on, module, app, integration (and an Extension is never loaded at run time) |
| **Extension Kit** | The MIT package `@ziffr/extension-kit` that an author writes against and checks with on their own computer. | SDK (the SDK is the API client) |
| **Wanted list** | The public list of Methods and marks people ask for. | Backlog, roadmap |

`GLOSSARY.md` gets **Extension**, **Extension Kit** and **Wanted list** in the tickets that first use them.

## What an Extension is

Two shapes, the same rules:

- **A Method:** a pure function over series, tables and numbers, with a typed signature (the kinds of spec 0041's `/2` format: series, value, table, model), parameters with ranges, and the Takeaway wording that belongs to it.
- **A mark:** a drawing rule for one kind of mark in a View Design: how a parameterised, typed list of values becomes shapes (geometry only; text, colours and sizes still come from Theme tokens). A mark takes its numbers from a Method, never calculates them.

An Extension is a folder of a fixed shape:

| File | What | Why it is required |
| --- | --- | --- |
| `extension.json` | Manifest: id (`author/name`), version, kind, author, licence, the signature, the limits it needs, the Ziffr version it was written for, a price (`free` for now) | So Packs can name and require it, and the checks know what to expect |
| `method.ts` or `mark.ts` | The implementation. Pure, no imports except `@ziffr/extension-kit` and `@ziffr/figures`, no `Date`, no `Math.random`, no global state, no I/O, no `eval`, no dynamic import, at most 400 lines | What Ziffr must read in full; short enough to be read |
| `reference.ts` | A second implementation worked out another way, as plainly as possible, sharing nothing with the first | Spec 0022's rule for every calculation; the tests compare the two |
| `cases.ts` and `fixtures/` | Hand-worked cases, and for a statistical Method values produced by an established tool (R, SciPy) with the script that produced them | So the numbers are tied to something outside this author's head |
| `catalogue.md` | The Calculation Catalogue row: the rule, in a sentence, its assumptions, its minimum data, when **not** to use it | Becomes the user-facing description |
| `wording.ts` | The Takeaway sentences for each case, in the form spec 0041's layer takes (strength, range, basis, assumption, refusal) | So a person reads a sentence, not a statistic; checked by the same forbidden-word test |
| `LICENSE` | The licence of this directory | See Licensing |

The Extension Kit (`npx @ziffr/extension-kit check ./my-extension`) runs everything Ziffr runs, on the author's computer, like `@ziffr/pack check` does for Packs: the shape, the static rules above (a parser, not a regular expression), generated tests of the Method against its reference, the 100 % path coverage and the mutation check of `docs/guides/calculation-tests.md`, a time and memory budget on a series of 120 points, and the refusals (a flat series, NaN, empty, too short) which must refuse rather than return a number. A check that passes on the author's machine passes in Ziffr's.

## How it gets in

1. **Idea.** The author picks something from the Wanted list or proposes it (a short text: the question it answers, in a sentence a non-analyst would say; the Method's name; a reference to a published source). Ziffr says yes or no on whether it fits and does not duplicate. Cheap and early, so nobody writes 400 lines for nothing.
2. **Write and check** with the Extension Kit, on their own computer.
3. **Submit** as a pull request to `extensions/<author>/<name>/` (a separate directory of its own, with its own `LICENSE`). The CLA applies (the author keeps the copyright and grants the Licensor the rights the CLA lists). CI runs the same check, plus the Ziffr-only parts: the catalogue entry is added, and the Extension is built into the app.
4. **Review by a person, every time.** The reviewer reads all the code (there are at most 400 lines), checks the reference is independent, the fixtures were produced by the stated tool and script, the wording is plain, and the Method does what the catalogue says. A security review is part of this because it will run on Ziffr's servers and in browsers with full rights. Nothing is skipped because the checks pass.
5. **Ship.** It goes into the next release with the author named in the catalogue and the Marketplace. Release notes say "New: <method>, by <author>".
6. **Maintain.** The author is asked to fix bugs for as long as they wish. Ziffr may fix or, if the author has gone, take it over, which the licence allows; a Method that has no maintainer and breaks is removed in a major version after notice, and Packs that need it say so on installing.

An Extension is versioned like a Pack. A change that alters a number is a new major version, and the old stays shipped while any Pack in a Workspace still names it, so saved results do not move (spec 0022's same-number rule).

## How a Pack uses one

A Pack's manifest gets `requires`: a list of Extension ids with a version range, `"requires": ["acme/survival@1"]`. `@ziffr/pack check` verifies the Extension exists in the Ziffr version the Pack names; installing checks the running Ziffr has it, and names what is missing if not ("This Pack needs the survival method, added in Ziffr 0.14"). An Analysis Recipe names the function as it names any other; a View Design names the mark.

Because Extensions ship with Ziffr, a self-hosted Installation has every free Extension of its version, and needs no connection to anywhere. A Pack that needs a newer Extension says so, and upgrading Ziffr gives it.

## Licensing

- **The code of a free Extension** lives in its own directory with its own `LICENSE`, **MIT by default** and chosen by the author from a short list (MIT, Apache-2.0). The root `LICENSE` of Ziffr already excludes any directory that contains its own `LICENSE`, so the BSL does not reach it and nothing about the BSL, the AGPL conversion or ADR 0009 changes. Its author keeps the copyright; the CLA gives the Licensor the right to ship it and to carry on shipping it if the author disappears.
- **A paid Extension** is the case ADR 0013 deferred (`ee/`). It cannot be MIT, since anyone could then take and use it for nothing; it would live in `ee/extensions/` under the Ziffr Business License, with a separate agreement with its author on the price and the share. This needs machinery that does not exist: a way to tell whether a Workspace may use it (an entitlement set by Ziffr Cloud for a subscription; for a self-hosted Installation a licence key checked offline). **This spec builds none of that.** Version 1 is free Extensions only. Paid Extensions are a decision for later, once at least five free ones are in and people have asked for a paid one (see the decisions below), and need a new ADR.
- **Credit** is part of the offer to authors: the name and link in the catalogue, in the app next to every Takeaway or chart that uses it ("Method by A. Author"), in the release notes, and on the Marketplace.

## What this does to the safety argument

- No Extension's code is run before a person has read it. The review is the control; the static rules and checks make that review short and keep out whole classes of problems.
- Every Extension runs with exactly the rights of Ziffr's own functions, which is why those rules are strict: pure, no imports, no I/O, no clock, no randomness. An Extension that wants to read a value can only be handed a series by the caller, and can only return a result. It cannot see other Metrics, names, people, or the network.
- A bug in an Extension is a bug in Ziffr. The author is not held to it; Ziffr is, which is the price of the model and the reason for the size cap and the full review.
- Rate of acceptance is limited by Ziffr's review time, deliberately. Fewer and better is the point.

## User Stories

1. As a statistician or a data-visualisation developer, I want to add a method or a chart to Ziffr and be credited, so that my work reaches the people who use Ziffr.
2. As an author, I want to check my Extension on my own computer with the exact checks Ziffr runs, so that I know before I submit whether it will be accepted.
3. As an author, I want to be told early whether an idea fits, so that I do not write something Ziffr would not take.
4. As an analyst who cannot write code, I want to put a method I need on the Wanted list and see others ask for it, so that developers know what is wanted.
5. As a Pack writer, I want to name an Extension in a Pack and have installing say what is missing, so that my Pack never half-works.
6. As an Owner, I want an Extension to be unable to read anything it was not handed or send anything anywhere, so that installing a Pack that uses one is no risk to our numbers.
7. As an Owner, I want to see who wrote a method I rely on, and which version, so that I know whom to thank or ask.
8. As anyone, I want a number from an Extension to be as verified as a number Ziffr wrote, and to say in plain words (spec 0041) what it means.
9. As a self-hoster, I want every free Extension to come with my release and need no connection to anywhere.
10. As Ziffr, I want review to cost little per Extension and not grow with the number of Extensions in use, so that I can say yes more often.

## Implementation Decisions

- **Where.** `packages/extension-kit` (MIT: the types, the checks, the CLI), `extensions/<author>/<name>/` (Extensions, each its own licence), a registry module in `packages/core` that lists the Extensions built into this release (`packages/core/src/extensions.ts`, generated from the folders so a missing manifest fails the build). The recipe functions and the mark list read the registry as well as the built-ins; nothing else changes about how a recipe or a design is checked.
- **The static rules** run on the syntax tree (`typescript`'s own parser): only the allowed imports; no identifiers from a list (`Date`, `Math.random`, `process`, `globalThis`, `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, `Function`, `import(`, `require`, `setTimeout`); no property access that reaches them by a string; no `any` and no type assertions to `any`; no assignment to anything outside the function. They are a first line, not a security boundary: the person reading the code is the boundary.
- **Determinism.** The check runs each Method twice on the same input in a fresh process and requires the same bytes, and runs it with the clock and the random generator replaced by throwing stubs.
- **Budget.** A Method over 120 points, 6 drivers, answers within a time set per kind of Method in the Kit and measured on a reference machine, with a memory ceiling, and cannot loop on its input (the check feeds it its worst inputs: very long, constant, alternating, huge and tiny values).
- **The mark's geometry** is checked like the renderer's own: areas proportional to values, nothing outside the box, nothing overlapping where the mark says it will not, the order of the data kept.
- **Packs.** `ziffr.pack/1` gets the `requires` field (optional). The Pack check and the installation check read it. Marketplace listings show what a Pack requires.
- **The Wanted list** is a page of the docs site and of the Marketplace, one entry per request: a question in plain words, the kind of Method, a link to a source, a vote count, and, once claimed, the author and the state. Version 1 is a GitHub label (`wanted`) on issues with a generated page: no new product surface until it is needed. **Visibility:** nothing on it comes from a Workspace; entries are written by whoever files them, and are public.
- **Author-facing documentation:** `docs/guides/writing-an-extension.md`, one worked example (a Method and a mark, each complete), and the review checklist, which is public so that authors know what the reviewer looks at.
- **First Extensions.** Spec 0041's Methods are built-ins, not Extensions. But two of them are built in the Extension shape on purpose, as the Kit's own test and as examples for authors: `quantile` and `topShare`. If the shape is awkward for Ziffr's own authors it is awkward for others, and ticket 3 below is where that is found.

## Testing Decisions

- The Kit's checks are themselves tested with **bad Extensions**: a collection in `packages/extension-kit/test/bad/` each of which must be refused for exactly one named reason (an import outside the list, a clock read, a random number, a loop without end, a result that differs between two runs, a Method that returns a number for a flat series, a reference that imports the implementation, a wording that contains a forbidden word, a function over 400 lines, a global written to, a mark that draws outside its box). A bad Extension that passes is a failing test.
- A **good Extension** (the worked example) passes, and its Pack that requires it installs, runs and gives the same Takeaway on a widget, a Snapshot, a View Link and the deck export (the same-number test).
- Installing a Pack whose `requires` names an Extension the running Ziffr does not have is refused with the name, in the web app, the API and the CLI.
- Removing an Extension in a major version leaves saved results of Workspaces that used it readable, with the reason (test with a recipe that names a removed function).
- The registry is generated, and a test fails if an Extension folder is not in it or the registry names one that is not there.

## Tickets

1. **Extension Kit, shape and static checks.** The manifest format and schema (`docs/reference/`), the folder checks, the static rules, the bad-Extension collection. MIT package.
2. **The checks that run the code.** Determinism, budgets, the reference comparison, coverage and mutation, the refusal checks. [1]
3. **The registry, and two built-ins in the shape.** `quantile` and `topShare` as Extensions in the repository, read through the registry by recipes and designs. Glossary: Extension, Extension Kit. [1, spec 0041 ticket 3]
4. **Marks as Extensions.** The mark shape, its geometry checks, a worked example. [1, 2]
5. **Packs require Extensions.** `requires` in the Pack format, the check, the installation refusal and message, the Marketplace listing. [3]
6. **Credit in the app.** The author's name next to a Takeaway or chart that uses an Extension; the catalogue row; the release note line. [3]
7. **The Wanted list.** The label, the generated page, the claim flow in the contributing guide. Glossary: Wanted list.
8. **Writing an Extension.** The guide, the worked example, the review checklist, the CLA note for Extensions; a lawyer reads the CLA for this use (ADR 0002 already asks for that review). [2, 4]
9. **A first outside Extension.** Found with the owner's help, written by someone else, reviewed, shipped. It is the real test of the guide. [8]

## Out of Scope

- Anything that runs code that Ziffr has not shipped: plugins, user scripts, a sandbox in a frame, WebAssembly modules. ADR 0013 stands. Where an author's work cannot fit the 400-line pure-function shape, the answer for now is no.
- Paid Extensions, their price, their share, entitlements and licence keys (see below).
- Extensions that read data, call a service or hold a credential. Those are Feeds, outside Ziffr (ADR 0006), and Ziffr only lists them.
- A review service run by anyone but Ziffr.

## Decisions

The owner accepted every recommendation on 2026-11-22. The recommendation of each point is what is decided.

1. **Paid Extensions: now, later or never.** Recommended: **later**, after five free ones. They need entitlements in Ziffr Cloud, an offline licence key for self-hosters and an `ee/` folder, none of which exists, and they put a second pricing model next to ADR 0013's one price per Workspace. The first Extensions show whether authors want money, or credit and a reason to build a reputation. When it comes, it needs an ADR.
2. **The author's share if paid.** If it comes, the review and the maintenance fall on Ziffr, so 80 % to the author, as for Packs, may be too high. A first guess to test: 70 %, and the same payout path (Stripe Connect) as Packs.
3. **Licence of free Extensions.** Recommended: the author's choice from MIT and Apache-2.0, because their directory is outside the BSL. A BSL or AGPL Extension would have to follow the rest of Ziffr and gains the author nothing.
4. **The size cap and the "no imports".** 400 lines and no packages are strict on purpose: they make a full read possible and rule out supply-chain risk. A statistical Method that needs a matrix library will want one. Recommended: keep the rule, and let `@ziffr/figures` and the Kit offer the exact arithmetic and the matrix and distribution helpers that spec 0041 writes anyway, so authors build on verified parts instead of their own.
5. **Who reviews.** Recommended: the owner, for the first five. The checklist is public from the start so that a second reviewer can join, but the point of the model is that a person has read every line.
6. **Whether to do this before there is demand.** Recommended: ticket 1 to 3 only, enough to prove the shape on Ziffr's own functions, and the rest once someone outside asks to contribute a method. Spec 0041 is useful with no Extensions at all.
