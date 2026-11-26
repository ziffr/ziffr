# Marketplace contract

What a **Marketplace** answers, what Ziffr sends it, and what it signs (spec 0059). This page is for whoever builds or runs a Marketplace. The checks are in [`@ziffr/pack`](../../packages/pack/README.md) (MIT), beside the Pack format; the JSON Schema is [`marketplace.schema.json`](marketplace.schema.json), generated from the definitions the checks run and never edited by hand, with one definition for each answer and statement.

## The address

One https address, such as `https://marketplace.ziffr.net`. Everything below is under it. Ziffr follows no redirect, waits at most 10 seconds and takes only status 200: a 404 reads as "does not know that Pack or version", anything else as "cannot be reached".

| Request | Answer | At most |
| --- | --- | --- |
| `GET v1/packs?q=` | definition `packs` | 256 KiB; Ziffr reads the first 50 |
| `GET v1/packs/{handle}/{slug}/versions/{version}` | definition `version` | the file at most 1 MiB |
| `POST v1/updates` with definition `updatesRequest` | definition `updates` | 256 KiB; Ziffr reads the first 500 |

With an empty `q`, `v1/packs` answers the newest Packs, newest first.

## Web pages

A Marketplace also serves two pages that people open in a browser.

| Page | Address |
| --- | --- |
| A Pack's page | `packs/{handle}/{slug}` |
| The form that reports a Pack | `packs/{handle}/{slug}/report?version={version}` |

## Listings

```json
{ "packs": [ { "id": "ziffr/sales-forecast", "name": "Sales forecast", "summary": "A weekly forecast meeting.", "author": "Ziffr", "license": "CC-BY-4.0", "version": "1.0.0" } ] }
```

A listing may add `"newCreator": true`. Only free licenses are offered: `CC-BY-4.0` and `MIT`. Ziffr drops a listing that does not pass and ignores fields it does not know.

## A version, and the signed statement

```json
{ "file": "{\"format\":\"ziffr.pack/1\", …}", "statement": "{\"format\":\"ziffr.pack-signature/1\", …}", "signature": "…==", "revocations": [] }
```

`file` is the Pack file's exact text. `statement` is the exact text that was signed, and `signature` is its Ed25519 signature in base64. The statement reads:

```json
{ "format": "ziffr.pack-signature/1", "id": "ziffr/sales-forecast", "version": "1.0.0", "sha256": "…", "key": "…", "signed": "2026-11-26T09:00:00Z", "reviewed": false }
```

| Field | What it is |
| --- | --- |
| `id`, `version` | The Pack and version of the file |
| `sha256` | The SHA-256 of the file's bytes in UTF-8, in hex |
| `key` | The id of the key that signed: the first 32 hex characters of the SHA-256 of its 32 raw bytes |
| `signed` | The moment of signing, in UTC |
| `reviewed` | `true` only when a moderator looked at this version |

The statement holds no other field. A signature says where a file came from. The checks Ziffr runs on every Pack are the protection.

Ziffr takes a file when, in this order:

1. a key it trusts signed the statement's exact bytes;
2. that key is not revoked;
3. it is a signing key, or a reserve key that has revoked a key;
4. the statement names that key, and the id, version and SHA-256 of the file asked for;
5. the file passes the Pack checks.

## Keys and revocations

A reader trusts public keys, each with a part: the **signing** key signs statements; the **reserve** key stays unused until the signing key must be taken out of use. Only the reserve key can do that, with a revocation. The `version` and `updates` answers carry up to 10 in `revocations`:

```json
{ "statement": "{\"format\":\"ziffr.key-revocation/1\",\"key\":\"…\",\"signed\":\"2026-11-26T09:00:00Z\"}", "signature": "…==" }
```

A revocation signed by any other key, or naming a reserve key, counts for nothing. Ziffr keeps a revocation that holds and refuses that key's statements from then on. After a revocation the reserve key signs statements, so a Marketplace signs every published version again and sends the revocation with each answer.

## The updates question

Ziffr asks at most once a day, for the whole Installation. It sends its version and the Packs installed from the Marketplace, each once with its oldest installed version, and nothing else.

```json
{ "updates": [ { "id": "ziffr/sales", "version": "1.2.0" } ], "withdrawn": [ { "id": "someone/club", "reason": "It copied another Pack." } ] }
```

A withdrawal's `reason` is plain text of at most 200 characters, with no markup and no web address. When `withdrawn` is there it is the whole list for the Packs asked about. A withdrawn Pack has no update, and its version requests answer 404.

## Check your answers

The same checks run in a program and on the command line:

```ts
import { checkMarketplaceAnswer } from "@ziffr/pack/marketplace";

const result = checkMarketplaceAnswer("version", body, { signing: [signingKey], reserve: [reserveKey] });
```

```sh skip="needs an answer file and keys of your own"
npx @ziffr/pack check-answer version answer.json --key <base64> --reserve-key <base64>
```

The kinds are `packs`, `version`, `updates` and `updates-request`. With keys, signatures and revocations are checked too.
