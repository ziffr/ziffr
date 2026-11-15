"use server";
// Stories (spec 0010, ticket #148; GLOSSARY: Story, Finding): server actions for the story page; the core checks the
// owner and Editors, and that every Metric added is one the writer sees.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import * as stories from "@ziffr/core/stories";

const done = () => revalidatePath("/", "layout");

/** Starts a story from the stories list and opens it, to write. */
export async function newStory(form: FormData) {
  const id = await stories.createStory(await currentActor(), String(form.get("name") ?? ""));
  done();
  redirect(`/stories/${id}`);
}

/** Saves a story's title and introduction. */
export async function saveStoryText(storyId: number, text: { name?: string; intro?: string }) {
  await stories.saveStoryText(await currentActor(), Number(storyId), text);
  done();
}

/** Adds a Finding about a Metric at the end. */
export async function addFinding(storyId: number, metricId: number) {
  await stories.addFinding(await currentActor(), Number(storyId), Number(metricId));
  done();
}

/** Moves a Finding up or down. */
export async function moveFinding(storyId: number, widgetId: number, by: -1 | 1) {
  await stories.moveFinding(await currentActor(), Number(storyId), Number(widgetId), by < 0 ? -1 : 1);
  done();
}
