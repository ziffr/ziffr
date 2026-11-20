"use server";
// Packs (spec 0030, GLOSSARY: Pack): thin calls into the core, which checks the file again on the server, and who may
// install (Owners and Admins; Owners for a Pack with Themes; never in the demo).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { installPackFile, readPackFile } from "@ziffr/core/packs";

/** Reads an uploaded Pack file for its Preview; nothing is written. The problems come back with their lines. */
export async function readPack(text: string) {
  return attempt(async () => readPackFile(await currentActor(), String(text ?? "")));
}

/** Installs an uploaded Pack file after its warnings were confirmed; returns the install's id. */
export async function installPack(text: string, confirmed: { unsigned: boolean; assistantTexts: boolean }) {
  return attempt(async () => {
    const id = await installPackFile(await currentActor(), String(text ?? ""), { unsigned: confirmed?.unsigned === true, assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return id;
  });
}
