// @ts-nocheck
// The release this Ziffr is (ADR 0014; not a GLOSSARY Version): what Packs are checked against and what Ziffr tells
// the Marketplace. A release's image carries it in ZIFFR_VERSION; anywhere else (`pnpm prototype`, tests, a build
// without it) it is the last release whose version is in package.json, since no release commits one any more.
import { version as packageVersion } from "../package.json";

/** This Ziffr's release as X.Y.Z: ZIFFR_VERSION when it is one, otherwise package.json's version. */
export const ZIFFR_VERSION: string = (() => {
  const fromImage = typeof process !== "undefined" ? process.env.ZIFFR_VERSION?.trim() : undefined;
  return fromImage && /^\d+\.\d+\.\d+$/.test(fromImage) ? fromImage : packageVersion;
})();
