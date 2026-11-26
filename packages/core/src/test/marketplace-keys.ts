// Marketplace Keys for tests (specs 0030 and 0059, #278, #1193): a key pair with the public key as Ziffr takes it, and
// answers signed as a Marketplace signs them. Test keys only: nothing here is a key of any Marketplace.
import { generateKeyPairSync, sign } from "node:crypto";
import { marketplaceKeyId, packSha256, REVOCATION_FORMAT, STATEMENT_FORMAT, WITHDRAWAL_FORMAT, type SignedText } from "@ziffr/pack/marketplace";

/** A key pair as a Marketplace would hold one, the public key as Ziffr takes it (base64 of the raw 32 bytes). */
export function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  const id = marketplaceKeyId(raw)!;
  const signed = (statement: Record<string, unknown>): SignedText => {
    const text = JSON.stringify(statement);
    return { statement: text, signature: sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64") };
  };
  return {
    publicKey: raw,
    id,
    /** The answer for a version: the file with the statement about it, with whatever a test changes in the statement. */
    version(file: string, change: Record<string, unknown> = {}) {
      const pack = JSON.parse(file) as { id: string; version: string };
      return { file, ...signed({ format: STATEMENT_FORMAT, id: pack.id, version: pack.version, sha256: packSha256(file), key: id, signed: "2026-11-26T09:00:00Z", reviewed: false, ...change }) };
    },
    /** A statement that a Pack is withdrawn, or with `state` "restored" that it no longer is. */
    withdraws(pack: string, sequence: number, change: Record<string, unknown> = {}) {
      return signed({ format: WITHDRAWAL_FORMAT, id: pack, state: "withdrawn", ...(change.state === "restored" ? {} : { reason: "It copied another Pack." }), sequence, key: id, signed: "2026-11-26T09:00:00Z", ...change });
    },
    /** A revocation of another key, signed by this one. */
    revokes: (key: string) => signed({ format: REVOCATION_FORMAT, key, signed: "2026-11-26T09:00:00Z" }),
  };
}
