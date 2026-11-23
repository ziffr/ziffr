"use server";
// The method picker on the Analysis Canvas (GLOSSARY: Analysis Canvas, Method; spec 0041, ticket 16): thin calls into the core, which
// works only on Metrics the acting person sees and reads what the browser sends with its limits. Nothing here reads the database.
import { currentActor } from "@/lib/viewer";
import { listPicker, runPicker } from "@ziffr/core/analysis-picker";

/** The list of Methods, fitted to the Metrics on the canvas that the person sees. */
export async function pickerList(canvasIds: number[]) {
  return listPicker(await currentActor(), canvasIds);
}

/** Runs the Method the person picked, with the Metrics and settings they chose, through the Takeaway layer. */
export async function pickerRun(request: unknown) {
  return runPicker(await currentActor(), request);
}
