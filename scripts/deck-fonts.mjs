// The font files behind the deck slides (spec 0069; GLOSSARY: Deck, Theme): which openly licensed files the width tables
// are measured from, and how to get exactly those. The slides break their lines from the tables, so the browser check
// draws with the same files. They are downloaded when needed and checked against their SHA-256: no font file is in the
// repository, and none is read while Ziffr runs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "https://fonts.gstatic.com/s";

/**
 * One entry per font a Theme can name that has an openly licensed file. All are SIL Open Font License 1.1 (each family's
 * OFL.txt in github.com/google/fonts). `arial` and `georgia` are measured from Arimo and Gelasio, which were made with
 * the same widths. General Sans has no entry: its licence is not an open one, so a slide draws it in Arial.
 */
export const DECK_FONTS = [
  { id: "arial", family: "Arimo", copyright: "Copyright 2020 The Arimo Project Authors", files: {
    400: ["arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk37cxsBw.ttf", "e5717ff6c2063b0e596176ddad929b0a98a6d8db694f43a8ba26c99675625b67"],
    700: ["arimo/v36/P5sfzZCDf9_T_3cV7NCUECyoxNk3CstsBw.ttf", "22261f10e78d5e16e5ae305cc6f4a0c5ca24a4b1f0e14d3eec5750fb57877a5a"] } },
  { id: "georgia", family: "Gelasio", copyright: "Copyright 2022 The Gelasio Project Authors", files: {
    400: ["gelasio/v14/cIfiMaFfvUQxTTqS3iKJkLGbI41wQL8Ilycs.ttf", "7884ef501e51508afee5a77b754325d21940cefaceea86cd679bf446295f088a"],
    700: ["gelasio/v14/cIfiMaFfvUQxTTqS3iKJkLGbI41wQL_vkCcs.ttf", "7c4853718408254af7b338bbfa9f04cdac8eaab75d9afde81943a1be543c4e2c"] } },
  { id: "inter", family: "Inter", copyright: "Copyright 2020 The Inter Project Authors", files: {
    400: ["inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", "1b08e7fc267a5c7e1d614100f604b83e7e8a0be241f0f288faa2b3ac93a683ba"],
    700: ["inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf", "b37284b5701b6b168dfc770aa1a4ac492106422fd3ba76bc7641e37434e8019c"] } },
  { id: "ibm-plex-sans", family: "IBM Plex Sans", copyright: "Copyright 2017 IBM Corp., with Reserved Font Name \"Plex\"", files: {
    400: ["ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf", "6dbe082463cf749cfa057d45c3048c90f4df031496498e5b5bdfd0b6babb9d16"],
    700: ["ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf", "e129a20e8ff7c907ffd07124b573e88c323b7b18afc934d4aa539a3e0f2fe100"] } },
  { id: "libre-franklin", family: "Libre Franklin", copyright: "Copyright 2020 The Libre Franklin Project Authors", files: {
    400: ["librefranklin/v20/jizOREVItHgc8qDIbSTKq4XkRg8T88bjFuXOnduhLsWUBw.ttf", "b03fb188d88811436d8b7d7b2b4964921a2c4416f0c042c7ecdb443dcd6e999d"],
    700: ["librefranklin/v20/jizOREVItHgc8qDIbSTKq4XkRg8T88bjFuXOnduhycKUBw.ttf", "0e8948888ff7e981ed6d702510413ef6813875087c4dd51933b7d9e27a1671f4"] } },
  { id: "source-serif", family: "Source Serif 4", copyright: "Copyright 2014 The Source Serif 4 Project Authors", files: {
    400: ["sourceserif4/v15/vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6OAVIJmeUDygwjihdqrhw.ttf", "f01900495012279f1e95d721c59363395eeffb79ef806eaa4dfa8bd923ccec0b"],
    700: ["sourceserif4/v15/vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6OAVIJmeUDygwjivBtrhw.ttf", "0efc0b44578e439999fc8654670925d7abc22d17b557588487acd673ff07c068"] } },
  { id: "playfair", family: "Playfair Display", copyright: "Copyright 2017 The Playfair Display Project Authors, with Reserved Font Name \"Playfair Display\"", files: {
    400: ["playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf", "1609a54fa3ad1abc8d0037132f73700333241ea0b65672079998e352f151dea7"],
    700: ["playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf", "adefc53e7b3d483f1fa5e85edd82b7689ca79db25a1f6786bd7949cdcfeec601"] } },
  { id: "geist-mono", family: "Geist Mono", copyright: "Copyright 2024 The Geist Project Authors", files: {
    400: ["geistmono/v6/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5T.ttf", "7022da390e9b401ea35b722f8ed2376948e70add10954bc798839b4bfe17ef3f"],
    700: ["geistmono/v6/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeHaL55T.ttf", "cc5aed02985feb352698b1963ce9234546ace8e46eceb61e1128f4e2a3bb9fec"] } },
  { id: "ibm-plex-mono", family: "IBM Plex Mono", copyright: "Copyright 2017 IBM Corp., with Reserved Font Name \"Plex\"", files: {
    400: ["ibmplexmono/v23/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf", "5cbc4288c3489acb668caf9bb59fcab8767f961575ad74c1366c40bc43a8cde3"],
    700: ["ibmplexmono/v23/-F6qfjptAgt5VM-kVkqdyU8n3pQP8lc.ttf", "e4d9444d1275b26e6ac3d6f7b8c2eaf324b4fc167f7fd0dcdfe7069cfb4665fe"] } },
];

/** Where downloaded files are kept between runs: inside node_modules, so nothing is ever committed. */
export const FONT_CACHE = fileURLToPath(new URL("../node_modules/.cache/deck-fonts", import.meta.url));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every font file, downloaded where the cache lacks it: `{ id, family, weight, path }`. Throws on a file that differs. */
export async function deckFontFiles(cache = FONT_CACHE) {
  mkdirSync(cache, { recursive: true });
  const wanted = DECK_FONTS.flatMap((font) => Object.entries(font.files).map(([weight, [address, hash]]) => ({ id: font.id, family: font.family, weight: Number(weight), address, hash })));
  return Promise.all(wanted.map(async ({ id, family, weight, address, hash }) => {
    const file = path.join(cache, `${id}-${weight}.ttf`);
    if (!existsSync(file) || sha256(readFileSync(file)) !== hash) {
      const response = await fetch(`${HOST}/${address}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${family} ${weight}: the font host answered ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== hash) throw new Error(`${family} ${weight}: the downloaded file is not the one the width tables were made from`);
      // Written beside it first, so two runs at once never read half a file.
      writeFileSync(`${file}.${process.pid}`, bytes);
      renameSync(`${file}.${process.pid}`, file);
    }
    return { id, family, weight, path: file };
  }));
}
