// Which people are Feeds (GLOSSARY: Feed; spec 0012). A Feed is a person row so its Tokens and values work as
// anyone's, but it is a program: it is never asked for a value, never gets a form link, and is never copied as a
// person. The places that reach people ask here. Kept apart from feeds.ts so that low-level modules (deliveries,
// page data) can use it without importing the submission path.
import { db } from "./db";

/** The ones among these person ids that are Feeds, deleted Feeds included. */
export async function feedIdsAmong(ids: readonly string[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Set();
  const { data } = await db().from("feeds").select("person_id").in("person_id", wanted);
  return new Set((data ?? []).map((f) => f.person_id as string));
}
