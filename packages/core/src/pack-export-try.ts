// "Try it" for an exported Pack (spec 0068; GLOSSARY: Pack, Preview): what the guided set-up would read of the very
// file the export would write, so its author walks the screens as whoever gets it will. Every function takes the Actor
// first.
// Security: it reads only what the export itself reads, so only someone who may export, and only what they may put into
// a file. Nothing is written: no file is stored, no Pack installed, no person added and nothing sent. The answer holds
// the file's own words, templates and Metric Catalog entries, never a person or a number of the Workspace: the screens
// are walked with made-up people.
import type { Actor } from "./actor";
import { checkPack } from "./pack";
import { exportPack, type ExportChoice, type ExportManifest, type ExportOptionsChosen } from "./pack-export";
import { drawingOf, startFromPack, type PackStartDrawing } from "./pack-start";
import type { StartDeclarations } from "./pack-start-steps";

/** What a try of an exported Pack walks through. */
export type PackExportTry = {
  pack: { id: string; name: string; version: string };
  declarations: StartDeclarations;
  drawing: PackStartDrawing;
  /** The texts of the file that whoever installs it is asked to read, as aimed at assistants. */
  assistantTexts: { path: string; text: string }[];
};

/** Reads the Pack of this pick as it would be written, for a try (anyone who may export). Throws, as the export does,
 * when the file cannot be made. */
export async function tryExportedPack(actor: Actor, manifest: ExportManifest, choice: ExportChoice, chosen: ExportOptionsChosen = {}): Promise<PackExportTry> {
  const { text } = await exportPack(actor, manifest, choice, chosen);
  // The file is read back as an installer's Ziffr reads it.
  const read = checkPack(text);
  if (!read.ok) throw new Error("The Pack cannot be tried: its file did not pass the checks.");
  const source = startFromPack(read.pack);
  return {
    pack: source.pack,
    declarations: source.declarations,
    drawing: drawingOf(source),
    assistantTexts: read.assistantTexts.map(({ path, text: words }) => ({ path, text: words })),
  };
}
