// A long answer to a reply, cut into chat messages (spec 0064; GLOSSARY: Combined Prompt): a message with many figures
// is answered with a line for each, which is more than one chat message holds. Pure.

/** The most messages one answer takes. */
const MOST = 10;

/** The text as pieces of at most `size` characters, cut between lines where it can be. */
export function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  let part = "";
  for (let line of text.split("\n")) {
    if (part && part.length + 1 + line.length > size) {
      out.push(part);
      part = "";
    }
    for (; line.length > size; line = line.slice(size)) out.push(line.slice(0, size));
    part = part ? `${part}\n${line}` : line;
  }
  if (part) out.push(part);
  return out.slice(0, MOST);
}
