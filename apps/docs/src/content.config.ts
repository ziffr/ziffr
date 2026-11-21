// The docs collection: everything scripts/sync.mjs wrote into src/content/docs.
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

/** The Starlight docs collection. */
export const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }) };
