#!/usr/bin/env node
// Renders the installable web app's icons (#143) from the one source, apps/web/public/icons/icon.svg: the sizes the
// manifest names, the square ("maskable") ones Android crops into its own shape, the apple-touch-icon iOS puts on the
// home screen, and the favicon. The output is checked in, so run this only after changing the source.
//
//   node scripts/app-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const WEB = join(import.meta.dirname, "../apps/web");
// sharp comes with Next (apps/web's dependency), so the repository needs no image tool of its own.
const sharp = createRequire(createRequire(join(WEB, "package.json")).resolve("next"))("sharp");

const rounded = readFileSync(join(WEB, "public/icons/icon.svg"));
// Android and iOS cut their own shape out of a full square, so those icons get no corners of their own. The mark sits
// inside the middle 80% that every crop keeps.
const square = Buffer.from(rounded.toString().replace('rx="112"', 'rx="0"'));

const png = (svg, size) => sharp(svg, { density: Math.ceil((72 * size) / 512) + 1 }).resize(size, size).png().toBuffer();

const out = [
  ["public/icons/icon-192.png", rounded, 192],
  ["public/icons/icon-512.png", rounded, 512],
  ["public/icons/maskable-192.png", square, 192],
  ["public/icons/maskable-512.png", square, 512],
  ["public/icons/apple-touch-icon.png", square, 180],
];
for (const [file, svg, size] of out) writeFileSync(join(WEB, file), await png(svg, size));

// A .ico may hold PNG images as they are: a 6-byte header, a 16-byte entry per image, then the images.
const images = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) })));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, data }, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at);
  header.writeUInt8(size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(data.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += data.length;
});
writeFileSync(join(WEB, "src/app/favicon.ico"), Buffer.concat([header, ...images.map((i) => i.data)]));
console.log("Wrote the app icons and the favicon.");
