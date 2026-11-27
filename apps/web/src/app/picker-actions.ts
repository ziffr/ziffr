"use server";
// The method picker on the Analysis Canvas (GLOSSARY: Analysis Canvas, Method; spec 0041, ticket 16): thin calls into the core, which
// works only on Metrics the acting person sees and reads what the browser sends with its limits. Nothing here reads the database.
import { currentActor } from "@/lib/viewer";
import { exampleFor, listPicker, runPicker } from "@ziffr/core/analysis-picker";

/** The list of Methods, fitted to the Metrics on the canvas that the person sees; the Slots that ask which Metric to explain start on `explains`. */
export async function pickerList(canvasIds: number[], explains?: number | null) {
  return listPicker(await currentActor(), canvasIds, explains);
}

/** Runs the Method the person picked, with the Metrics and settings they chose, through the Takeaway layer. */
export async function pickerRun(request: unknown) {
  return runPicker(await currentActor(), request);
}

/** The question answered on Sample Data, for "See an example"; reads no Metric and saves nothing. */
export async function pickerExample(entry: unknown, span: unknown) {
  return exampleFor(await currentActor(), entry, span);
}
