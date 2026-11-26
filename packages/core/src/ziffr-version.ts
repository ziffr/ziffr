// The release this Ziffr is (ADR 0014; not a GLOSSARY Version): what Packs are checked against and what Ziffr tells
// the Marketplace. A release's image carries it in ZIFFR_VERSION; anywhere else (`pnpm prototype`, tests, a build
// without it) it is the last release whose version is in package.json, since no release commits one any more.
import { version as packageVersion } from "../package.json";

const fromImage = typeof process !== "undefined" ? process.env.ZIFFR_VERSION?.trim() : undefined;
const release = fromImage && /^\d+\.\d+\.\d+$/.test(fromImage) ? fromImage : null;

/** This Ziffr's release as X.Y.Z: ZIFFR_VERSION when it is one, otherwise package.json's version. */
export const ZIFFR_VERSION: string = release ?? packageVersion;

/** What a Pack's `ziffr` minimum is held to: a release, to its own version. A build that is no release (the development
 * app, tests, the image of main) is newer than every release of its major, while package.json's version stands still, so
 * it takes any minimum of that major. */
export const PACK_ZIFFR_VERSION: string = release ?? `${packageVersion.split(".")[0]}.9999.0`;
