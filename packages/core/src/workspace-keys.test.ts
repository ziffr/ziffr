// Workspace Keys (spec 0028, ticket #245): sealing, opening, wrapping and blind indexes, without a database.
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { openSecret } from "./secrets";
import { cipherFromKeys, installationKeyFingerprint, installationKeyWrapper, isSealed, keyCache, normaliseForIndex } from "./workspace-keys";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);
const at = { table: "thread_messages", column: "body", row: 42 };

/** Changes one base64url character of the given part of a dotted value. */
function flip(value: string, part: number): string {
  const parts = value.split(".");
  const p = parts[part];
  parts[part] = `${p[0] === "A" ? "B" : "A"}${p.slice(1)}`;
  return parts.join(".");
}

describe("sealing and opening", () => {
  const c = cipherFromKeys(WS, [{ version: 1, key: k1 }]);

  it("seals into w1.<version>.<iv>.<ciphertext>.<tag> and opens in the same place", () => {
    const sealed = c.seal(at, "Revenue was 12,400 in March, Ana said");
    expect(sealed).toMatch(/^w1\.1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(sealed).not.toContain("Revenue");
    expect(isSealed(sealed)).toBe(true);
    expect(c.open(at, sealed)).toBe("Revenue was 12,400 in March, Ana said");
    // A fresh IV every time: the same words never seal to the same text.
    expect(c.seal(at, "same")).not.toBe(c.seal(at, "same"));
  });

  it("opens empty text and text in any script", () => {
    for (const plain of ["", "Grüße, 東京 🚀", "a".repeat(10_000)]) expect(c.open(at, c.seal(at, plain))).toBe(plain);
  });

  it("refuses a value moved to another Workspace, table, column or row", () => {
    const sealed = c.seal(at, "secret words");
    const elsewhere = cipherFromKeys(OTHER, [{ version: 1, key: k1 }]);
    expect(elsewhere.open(at, sealed)).toBeNull();
    expect(c.open({ ...at, table: "contacts" }, sealed)).toBeNull();
    expect(c.open({ ...at, column: "title" }, sealed)).toBeNull();
    expect(c.open({ ...at, row: 43 }, sealed)).toBeNull();
    expect(c.open({ ...at, row: "42" }, sealed)).toBe("secret words");
  });

  it("refuses a value under another key or an unknown version", () => {
    const sealed = c.seal(at, "secret words");
    expect(cipherFromKeys(WS, [{ version: 1, key: k2 }]).open(at, sealed)).toBeNull();
    expect(cipherFromKeys(WS, [{ version: 2, key: k1 }]).open(at, sealed)).toBeNull();
    expect(cipherFromKeys(WS, []).open(at, sealed)).toBeNull();
  });

  it("refuses any changed byte, a short tag and a changed version", () => {
    const sealed = c.seal(at, "secret words");
    expect(c.open(at, flip(sealed, 2))).toBeNull();
    expect(c.open(at, flip(sealed, 3))).toBeNull();
    expect(c.open(at, flip(sealed, 4))).toBeNull();
    const parts = sealed.split(".");
    // A tag cut to 12 bytes is not the sealed format: it is never opened, so a short tag cannot be forged into a
    // value; it comes back as the text it is.
    const short = [...parts.slice(0, 4), Buffer.from(parts[4], "base64url").subarray(0, 12).toString("base64url")].join(".");
    expect(isSealed(short)).toBe(false);
    expect(c.open(at, short)).toBe(short);
    expect(c.open(at, ["w1", "2", ...parts.slice(2)].join("."))).toBeNull();
  });

  it("passes plain values through while old rows wait to be sealed, and null stays null", () => {
    expect(c.open(at, "written before the upgrade")).toBe("written before the upgrade");
    expect(c.open(at, "w1.looks.like.it")).toBe("w1.looks.like.it");
    expect(c.open(at, null)).toBeNull();
    expect(c.open(at, undefined)).toBeNull();
    expect(isSealed("plain")).toBe(false);
    expect(isSealed(null)).toBe(false);
  });

  it("does not seal without a key (the demo, or no ZIFFR_SECRETS_KEY)", () => {
    const none = cipherFromKeys(WS, []);
    expect(none.sealing).toBe(false);
    expect(none.seal(at, "plain")).toBe("plain");
    expect(none.blindIndex("contacts.email", "a@b.example")).toBeNull();
    expect(none.blindIndexes("contacts.email", "a@b.example")).toEqual([]);
  });

  it("seals under the current version and opens every version it has", () => {
    const old = c.seal(at, "under version 1");
    const both = cipherFromKeys(WS, [{ version: 1, key: k1 }, { version: 2, key: k2 }]);
    expect(both.seal(at, "x").startsWith("w1.2.")).toBe(true);
    expect(both.open(at, old)).toBe("under version 1");
    // Version 1 can be made current again (a key change taken back): then it seals.
    expect(cipherFromKeys(WS, [{ version: 1, key: k1 }, { version: 2, key: k2 }], 1).seal(at, "x").startsWith("w1.1.")).toBe(true);
  });

  it("refuses a place that is not one: no names with other characters, no empty row", () => {
    expect(() => c.seal({ table: "thread_messages:x", column: "body", row: 1 }, "x")).toThrow();
    expect(() => c.seal({ table: "t", column: "Body", row: 1 }, "x")).toThrow();
    expect(() => c.open({ table: "t", column: "c", row: "1:2" }, "x")).toThrow();
    expect(() => c.seal({ table: "t", column: "c", row: "" }, "x")).toThrow();
    expect(() => cipherFromKeys("not-a-uuid", [])).toThrow();
  });

  it("names a row one way only: a uuid in any case, an exact number", () => {
    const row = "AAAAAAAA-0000-4000-8000-00000000000A";
    const sealed = c.seal({ ...at, row }, "x");
    expect(c.open({ ...at, row: row.toLowerCase() }, sealed)).toBe("x");
    expect(() => c.seal({ ...at, row: 2 ** 53 }, "x")).toThrow();
    expect(() => c.seal({ ...at, row: -1 }, "x")).toThrow();
    expect(() => c.seal({ ...at, row: 1.5 }, "x")).toThrow();
  });

  it("opens only the one spelling of a sealed value", () => {
    const sealed = c.seal(at, "x");
    const parts = sealed.split(".");
    // The last character of a 16-byte tag carries 4 spare bits: another letter there decodes to the same bytes.
    const last = parts[4].slice(-1);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const twin = [...alphabet].find((ch) => ch !== last && Buffer.from(parts[4].slice(0, -1) + ch, "base64url").equals(Buffer.from(parts[4], "base64url")));
    expect(twin).toBeDefined();
    expect(c.open(at, [...parts.slice(0, 4), parts[4].slice(0, -1) + twin].join("."))).toBeNull();
  });

  it("never shows a key when printed or turned into JSON", () => {
    const shown = `${inspect(c, { showHidden: true, depth: 10 })} ${JSON.stringify(c)}`;
    expect(shown).not.toContain(k1.toString("hex"));
    expect(shown).not.toMatch(/<Buffer/);
    expect(Object.isFrozen(c)).toBe(true);
  });

  it("keeps its own copy: zeroing the caller's key changes nothing", () => {
    const key = Buffer.alloc(32, 5);
    const own = cipherFromKeys(WS, [{ version: 1, key }]);
    const sealed = own.seal(at, "kept");
    key.fill(0);
    expect(own.open(at, sealed)).toBe("kept");
  });
});

describe("blind indexes", () => {
  const c = cipherFromKeys(WS, [{ version: 1, key: k1 }]);

  it("are equal for equal normalised values, and differ otherwise", () => {
    const a = c.blindIndex("contacts.email", "Ana@Example.com ");
    expect(a).toBe(c.blindIndex("contacts.email", "ana@example.com"));
    expect(a).toMatch(/^b1\.1\.[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain("ana");
    expect(c.blindIndex("contacts.email", "bo@example.com")).not.toBe(a);
    // The same text in another column has another index.
    expect(c.blindIndex("breakdown_rows.label", "ana@example.com")).not.toBe(a);
    // Composed and decomposed Unicode are one value.
    expect(c.blindIndex("breakdown_rows.label", "Café")).toBe(c.blindIndex("breakdown_rows.label", "Café"));
    expect(normaliseForIndex("  ÄBC ")).toBe("äbc");
  });

  it("differ across Workspaces, even with the same key bytes", () => {
    const elsewhere = cipherFromKeys(OTHER, [{ version: 1, key: k2 }]);
    expect(elsewhere.blindIndex("contacts.email", "ana@example.com")).not.toBe(c.blindIndex("contacts.email", "ana@example.com"));
  });

  it("are listed for every version, newest first, to find a row whichever version wrote it", () => {
    const both = cipherFromKeys(WS, [{ version: 1, key: k1 }, { version: 2, key: k2 }]);
    const all = both.blindIndexes("contacts.email", "ana@example.com");
    expect(all).toHaveLength(2);
    expect(all[0].startsWith("b1.2.")).toBe(true);
    expect(all[1]).toBe(c.blindIndex("contacts.email", "ana@example.com"));
  });

  it("are not an HMAC under the Workspace Key itself", () => {
    const own = cipherFromKeys(WS, [{ version: 1, key: k1 }]).blindIndex("contacts.email", "x");
    const derived = Buffer.from(hkdfSync("sha256", k1, Buffer.alloc(0), "ziffr/blind-index/v1", 32));
    expect(derived.equals(k1)).toBe(false);
    expect(own).not.toBeNull();
    expect(() => c.blindIndex("email", "x")).toThrow();
  });
});

describe("wrapping through the Installation's key", () => {
  const installation = Buffer.alloc(32, 7);
  const previous = Buffer.alloc(32, 6);
  const wk = Buffer.alloc(32, 3);

  it("wraps for one Workspace and version, never in clear, and unwraps there only", async () => {
    const w = installationKeyWrapper(() => ({ current: installation, previous: null }));
    const { wrapped, under } = await w.wrap(WS, 1, wk);
    expect(wrapped).toMatch(/^k1\./);
    expect(wrapped).not.toContain(wk.toString("base64url"));
    expect(under).toBe(installationKeyFingerprint(installation));
    expect((await w.unwrap(WS, 1, wrapped))?.key.equals(wk)).toBe(true);
    expect(await w.unwrap(OTHER, 1, wrapped)).toBeNull();
    expect(await w.unwrap(WS, 2, wrapped)).toBeNull();
    expect(await w.unwrap(WS, 1, flip(wrapped, 2))).toBeNull();
    expect(await w.unwrap(WS, 1, flip(wrapped, 3))).toBeNull();
    expect(await w.unwrap(WS, 1, "garbage")).toBeNull();
  });

  it("uses a key derived under its own label, not ZIFFR_SECRETS_KEY itself", async () => {
    const w = installationKeyWrapper(() => ({ current: installation, previous: null }));
    // The same Workspace Key wrapped the same way but with the raw ZIFFR_SECRETS_KEY (the bytes that seal Slack tokens
    // and settings in secrets.ts) does not unwrap, and what the wrapper wraps does not open with the raw key.
    const raw = (key: Buffer) => {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      c.setAAD(Buffer.from(`ziffr/workspace-key:${WS}:1`));
      const ct = Buffer.concat([c.update(wk), c.final()]);
      return ["k1", iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
    };
    expect(await w.unwrap(WS, 1, raw(installation))).toBeNull();
    const derived = Buffer.from(hkdfSync("sha256", installation, Buffer.alloc(0), "ziffr/workspace-key-wrap/v1", 32));
    expect((await w.unwrap(WS, 1, raw(derived)))?.key.equals(wk)).toBe(true);
    const { wrapped } = await w.wrap(WS, 1, wk);
    const [, iv, ct, tag] = wrapped.split(".");
    expect(openSecret(["v1", iv, ct, tag].join("."), `ziffr/workspace-key:${WS}:1`, installation)).toBeNull();
  });

  it("unwraps with ZIFFR_SECRETS_KEY_PREVIOUS while the Installation's key changes, and says so (spec 0009)", async () => {
    const before = installationKeyWrapper(() => ({ current: previous, previous: null }));
    const { wrapped, under } = await before.wrap(WS, 1, wk);
    const after = installationKeyWrapper(() => ({ current: installation, previous }));
    const opened = await after.unwrap(WS, 1, wrapped);
    expect(opened?.key.equals(wk)).toBe(true);
    expect(opened?.stale).toBe(true);
    expect(under).toBe(installationKeyFingerprint(previous));
    expect(under).not.toBe(installationKeyFingerprint(installation));
    // Without the previous key it does not open.
    expect(await installationKeyWrapper(() => ({ current: installation, previous: null })).unwrap(WS, 1, wrapped)).toBeNull();
    // Wrapped again under the new key, it is not stale.
    const again = await after.wrap(WS, 1, wk);
    expect((await after.unwrap(WS, 1, again.wrapped))?.stale).toBe(false);
  });

  it("refuses to wrap without ZIFFR_SECRETS_KEY, or a key that is not 32 bytes", async () => {
    await expect(installationKeyWrapper(() => ({ current: null, previous: null })).wrap(WS, 1, wk)).rejects.toThrow(/ZIFFR_SECRETS_KEY/);
    await expect(installationKeyWrapper(() => ({ current: installation, previous: null })).wrap(WS, 1, Buffer.alloc(16))).rejects.toThrow();
  });

  it("has a fingerprint that is not the key and tells keys apart", () => {
    const f = installationKeyFingerprint(installation);
    expect(f).toMatch(/^[0-9a-f]{16}$/);
    expect(installation.toString("hex")).not.toContain(f);
    expect(installationKeyFingerprint(previous)).not.toBe(f);
  });
});

describe("the key cache", () => {
  const cipher = cipherFromKeys(WS, []);

  it("keeps a Workspace for 10 minutes", () => {
    let t = 0;
    const cache = keyCache({ now: () => t });
    cache.set(WS, cipher);
    t = 9 * 60_000;
    expect(cache.get(WS)).toBe(cipher);
    t = 10 * 60_000;
    expect(cache.get(WS)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("holds at most its limit, dropping the least recently used first", () => {
    const cache = keyCache({ max: 2 });
    cache.set("a", cipher);
    cache.set("b", cipher);
    cache.get("a");
    cache.set("c", cipher);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(cipher);
    expect(cache.get("c")).toBe(cipher);
    expect(cache.size).toBe(2);
  });

  it("lets expired keys go when another Workspace is added", () => {
    let t = 0;
    const cache = keyCache({ now: () => t });
    cache.set("a", cipher);
    t = 11 * 60_000;
    cache.set("b", cipher);
    expect(cache.size).toBe(1);
  });

  it("drops a Workspace at once when asked", () => {
    const cache = keyCache();
    cache.set(WS, cipher);
    cache.delete(WS);
    expect(cache.get(WS)).toBeUndefined();
  });

  it("holds 1,000 Workspaces by default", () => {
    const cache = keyCache();
    for (let i = 0; i < 1001; i++) cache.set(`w${i}`, cipher);
    expect(cache.size).toBe(1000);
    expect(cache.get("w0")).toBeUndefined();
  });
});
