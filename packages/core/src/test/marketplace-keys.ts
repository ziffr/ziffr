// A Marketplace key pair for tests (spec 0030, #278): the public key as Ziffr takes it, and a way to sign a file.
import { generateKeyPairSync, sign } from "node:crypto";

/** A key pair as the Marketplace would hold one, the public key as Ziffr takes it (base64 of the raw 32 bytes). */
export function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { publicKey: raw, sign: (text: string) => sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64") };
}
