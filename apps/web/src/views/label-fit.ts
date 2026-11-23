// Words that fit a narrow place (GLOSSARY: View Design): a label is broken only at spaces, never inside a word, and a single word
// longer than a line gets an ellipsis; wide scripts (CJK, kana, Hangul) count twice as wide. Pure; the full label stays in the
// element's title.

const wide = (ch: string) => /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch);
const width = (s: string) => [...s].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);
// The longest start of `s` that fits `room`, with an ellipsis.
function clip(s: string, room: number): string {
  let out = "";
  for (const ch of s) {
    if (width(out + ch) > room - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** The label as at most `lines` lines of at most `room` characters: words stay whole, a word longer than a line is clipped with an ellipsis, and what does not fit in the lines ends the last line with one. */
export function fitWords(label: string, room: number, lines: number): string[] {
  const words = label.split(/\s+/).filter(Boolean).map((w) => (width(w) > room ? clip(w, room) : w));
  const out: string[] = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (width(next) <= room) {
      line = next;
      continue;
    }
    if (out.length === lines - 1) break;
    out.push(line);
    line = words[i];
  }
  // Words left over end the last line with an ellipsis.
  out.push(i < words.length ? (width(line) + 1 <= room ? `${line}…` : clip(line, room)) : line);
  return out;
}
