// What a form opened without sign-in says about answering in someone's place (GLOSSARY: Stand-in, Filled-in Value,
// Contact, Guest; spec 0046). Internal to the core: it checks no Actor; its callers hold the Token.
import { db } from "./db";
import { openNames } from "./sealed-columns";
import type { Token } from "./types";

/** Whose value a Stand-in's form says it records, or null. A Stand-in is told so, since their answer is a Filled-in
 * Value, marked as entered by them: a member reads the name of the person the Token stands in for and of nobody else; a
 * Contact, who has no sign-in, reads "your colleague"; a Guest, whose answer stays their own, is told nothing. */
export async function standingInWords(ws: string, token: Pick<Token, "submitter_id" | "stands_in_for">): Promise<string | null> {
  if (!token.stands_in_for) return null;
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", token.submitter_id).maybeSingle();
  if (member?.role === "guest") return null;
  if (!member) return "your colleague";
  const { data } = await db().from("profiles").select("id, name").eq("id", token.stands_in_for);
  return (await openNames(ws, (data ?? []) as { id: string; name: string }[]))[0]?.name ?? null;
}
