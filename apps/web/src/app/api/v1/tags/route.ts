// GET /api/v1/tags (spec 0038; GLOSSARY: Tag): the Tags the key's creator sees, each with how many Metrics they see it on.
// Scope metrics:read. A Tag is listed only through a Metric the creator may see. There is no way to rename, merge or
// delete a Tag here: that is done by an Owner or Admin on the Tags page, never by a program.
import { listTags } from "@ziffr/core/api";
import { json, keyRoute } from "@/lib/api";
import { TagList } from "../schemas";

/** Lists the Tags the key's creator sees. */
export const GET = keyRoute("metrics:read", async (actor) => json(TagList.parse({ items: await listTags(actor) })));
