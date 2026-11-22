// Source maps for the checks that run an Extension (GLOSSARY: Extension Kit): the code that ran is compiled JavaScript,
// and a person is told the line of the TypeScript they wrote. Reads the "mappings" of a version 3 map; nothing more.

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes one segment of base64 variable-length numbers into its fields. */
function segment(text: string): number[] {
  const out: number[] = [];
  let shift = 0;
  let value = 0;
  for (const ch of text) {
    const digit = BASE64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** The line of the source (from 1) that a position (line and column from 0) of the compiled text comes from, or null. */
export function sourceLine(mapText: string, line: number, column: number): number | null {
  let map: { mappings?: unknown };
  try {
    map = JSON.parse(mapText) as { mappings?: unknown };
  } catch {
    return null;
  }
  if (typeof map.mappings !== "string") return null;
  let found: number | null = null;
  const lines = map.mappings.split(";");
  let originalLine = 0;
  for (let l = 0; l <= line && l < lines.length; l++) {
    let col = 0;
    for (const seg of lines[l].split(",")) {
      if (!seg) continue;
      const f = segment(seg);
      col += f[0];
      if (f.length < 4) continue;
      originalLine += f[2];
      if (l === line && col <= column) found = originalLine + 1;
    }
  }
  return found;
}

/** The line and column (both from 0) of an offset in a text. */
export function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, column: offset - (before.lastIndexOf("\n") + 1) };
}
