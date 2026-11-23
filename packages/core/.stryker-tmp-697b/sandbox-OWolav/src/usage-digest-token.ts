// @ts-nocheck
// The unsubscribe link of the monthly usage digest (spec 0031, ticket #368; GLOSSARY: Usage). The link must work with
// no sign-in, so it carries a token signed for one person and this one use (unsubscribe-token.ts).
import { unsubscribeSigner } from "./unsubscribe-token";

const signer = unsubscribeSigner("ziffr/usage-digest-unsubscribe/v1", /^[\x21-\x7e]{1,128}$/, 128);

/** Whether a link can be signed here at all. */
export const digestTokenAvailable = signer.available;

/** The token for a person's digest, or null when this Installation has no key to sign with. */
export const signDigestToken = signer.sign;

/** The person a token was signed for, or null for anything else. */
export const verifyDigestToken = signer.verify;
