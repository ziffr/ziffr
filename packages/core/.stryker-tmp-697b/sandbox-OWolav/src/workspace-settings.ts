// @ts-nocheck
// Workspace settings (spec 0006, tickets #96 and #97; spec 0022, tickets #108, #118 and #130; GLOSSARY: Workspace,
// Workspace Role, Workspace Profile, Number Style, Answer Language, Attainment): the workspace's name, its Workspace
// Profile, its Number Style, its Answer Languages and its Attainment method. Owners and Admins change them, never in
// the demo; every member reads.
import { Forbidden, type Actor } from "./actor";
import { DEFAULT_ATTAINMENT_METHOD, isAttainmentMethod, type AttainmentMethod } from "./attainment-method";
import { audit } from "./audit-log";
import { db } from "./db";
import { isNumberStyle, numberStyleForCountry, type NumberStyle } from "./number-style";
import { ANSWER_LANGUAGES, answerLanguagesForCountry, checkAnswerLanguages, monthFirstIn } from "./numbers/languages";
import { HIDDEN_CHARACTERS } from "./profile";
import { checkProfile, COUNTRIES, type WorkspaceProfile } from "./workspace-profile";

/** The longest name a workspace can have. */
export const MAX_WORKSPACE_NAME = 80;

function assertManages(actor: Actor, what: string) {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden(`Only Owners and Admins change the workspace's ${what}.`);
}

/** The workspace's name. */
export async function workspaceName(actor: Actor): Promise<string> {
  const { data } = await db().from("workspaces").select("name").eq("id", actor.workspaceId).single();
  return String(data?.name ?? "");
}

/** Renames the actor's workspace, for Owners and Admins. */
export async function renameWorkspace(actor: Actor, name: unknown): Promise<void> {
  assertManages(actor, "name");
  if (typeof name !== "string" || HIDDEN_CHARACTERS.test(name)) throw new Error("Give the workspace a name without hidden characters.");
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Give the workspace a name.");
  if ([...clean].length > MAX_WORKSPACE_NAME) throw new Error(`Keep the name to ${MAX_WORKSPACE_NAME} characters.`);
  const before = await workspaceName(actor);
  const { error } = await db().from("workspaces").update({ name: clean }).eq("id", actor.workspaceId);
  if (error) throw new Error("The name could not be saved.");
  if (before !== clean) await audit(actor, { kind: "workspace.renamed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before, to: clean } });
}

/** What kind of business the actor's workspace belongs to, for any member (a Guest too: it describes the team, not a
 * person). The Metric Catalog reads it to suggest Metrics; every field is null until set. */
export async function workspaceProfile(actor: Actor): Promise<WorkspaceProfile> {
  const { data } = await db().from("workspaces").select("industry, segment, country, currency, employee_band, revenue_band").eq("id", actor.workspaceId).single();
  // Read back through the same check, so a caller only ever gets values from the lists.
  const r = checkProfile({ industry: data?.industry, segment: data?.segment, country: data?.country, currency: data?.currency, employeeBand: data?.employee_band, revenueBand: data?.revenue_band });
  return r.ok ? r.profile : { industry: null, segment: null, country: null, currency: null, employeeBand: null, revenueBand: null };
}

/** Sets the whole Workspace Profile, for Owners and Admins; a field left out or null is cleared. Every value must be
 * on its list. */
export async function setWorkspaceProfile(actor: Actor, input: unknown): Promise<WorkspaceProfile> {
  assertManages(actor, "profile");
  const r = checkProfile(input);
  if (!r.ok) throw new Error(`Pick the ${r.field === "employeeBand" ? "number of people" : r.field === "revenueBand" ? "revenue" : r.field} from the list.`);
  const p = r.profile;
  const before = await workspaceProfile(actor);
  const { error } = await db().from("workspaces").update({ industry: p.industry, segment: p.segment, country: p.country, currency: p.currency, employee_band: p.employeeBand, revenue_band: p.revenueBand }).eq("id", actor.workspaceId);
  if (error) throw new Error("The profile could not be saved.");
  // Only values from the fixed lists, so the details hold nothing a person typed.
  const changed = (Object.keys(p) as (keyof WorkspaceProfile)[]).filter((k) => before[k] !== p[k]);
  if (changed.length) await audit(actor, { kind: "workspace.profile_changed", object: { type: "workspace", id: actor.workspaceId }, details: Object.fromEntries(changed.flatMap((k) => { const key = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`); return [[`from_${key}`, before[k]], [`to_${key}`, p[k]]]; })) });
  return p;
}

/** A workspace's Number Style and where it comes from: `chosen` once an Owner or Admin picked it; until then it
 * follows `fromCountry`, the Workspace Profile's country, and is the default when that is null. */
export type WorkspaceNumberStyle = { style: NumberStyle; chosen: boolean; fromCountry: string | null };

async function numberStyleIn(workspaceId: string): Promise<WorkspaceNumberStyle> {
  const { data } = await db().from("workspaces").select("number_style, country").eq("id", workspaceId).maybeSingle();
  if (isNumberStyle(data?.number_style)) return { style: data.number_style, chosen: true, fromCountry: null };
  // Only a country from the list counts, the same check the Workspace Profile is read back through.
  const country = typeof data?.country === "string" && (COUNTRIES as readonly string[]).includes(data.country) ? data.country : null;
  return { style: numberStyleForCountry(country), chosen: false, fromCountry: country };
}

/** The Number Style of a workspace, for code that has already checked who may see it. */
export async function numberStyleOf(workspaceId: string): Promise<NumberStyle> {
  return (await numberStyleIn(workspaceId)).style;
}

/** The actor's workspace's Number Style and whether it was chosen or follows the country, for any member (a Guest
 * too: every value they see is written in it). */
export async function workspaceNumberStyle(actor: Pick<Actor, "workspaceId">): Promise<WorkspaceNumberStyle> {
  return numberStyleIn(actor.workspaceId);
}

/** Sets the workspace's Number Style, for Owners and Admins; audited. Once set it no longer follows the country. */
export async function setNumberStyle(actor: Actor, style: unknown): Promise<NumberStyle> {
  assertManages(actor, "Number Style");
  if (!isNumberStyle(style)) throw new Error("Pick a Number Style from the list.");
  const before = await numberStyleIn(actor.workspaceId);
  if (before.chosen && before.style === style) return style;
  const { error } = await db().from("workspaces").update({ number_style: style }).eq("id", actor.workspaceId);
  if (error) throw new Error("The Number Style could not be saved.");
  // One of the four keys, or null for a style that followed the country (or the default, without one): nothing a
  // person typed.
  await audit(actor, { kind: "workspace.number_style_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before.chosen ? before.style : null, ...(before.chosen ? {} : { followed: before.fromCountry ? "country" : "default" }), to: style } });
  return style;
}

/** A workspace's Answer Languages and where they come from: `chosen` once an Owner or Admin picked them; until then
 * they follow `fromCountry`, the Workspace Profile's country (English plus its languages), and are English alone
 * without one. */
export type WorkspaceAnswerLanguages = { languages: string[]; chosen: boolean; fromCountry: string | null };

async function answerLanguagesIn(workspaceId: string): Promise<WorkspaceAnswerLanguages & { country: string | null }> {
  const { data } = await db().from("workspaces").select("answer_languages, country").eq("id", workspaceId).maybeSingle();
  const country = typeof data?.country === "string" && (COUNTRIES as readonly string[]).includes(data.country) ? data.country : null;
  // A stored code Ziffr no longer has words for is left out; with none left, the country decides again.
  const stored = Array.isArray(data?.answer_languages) ? (data.answer_languages as unknown[]).filter((c): c is string => typeof c === "string" && Object.hasOwn(ANSWER_LANGUAGES, c)) : [];
  if (stored.length) return { languages: stored, chosen: true, fromCountry: null, country };
  return { languages: answerLanguagesForCountry(country), chosen: false, fromCountry: country, country };
}

/** How answers in a workspace are read: its Answer Languages, and whether a date such as "11/12" puts the month first
 * (from its country). For code that has already checked who may see it. */
export async function answerReadingOf(workspaceId: string): Promise<{ languages: string[]; monthFirst: boolean }> {
  const a = await answerLanguagesIn(workspaceId);
  return { languages: a.languages, monthFirst: monthFirstIn(a.country) };
}

/** The actor's workspace's Answer Languages and whether they were chosen or follow the country, for any member. */
export async function workspaceAnswerLanguages(actor: Pick<Actor, "workspaceId">): Promise<WorkspaceAnswerLanguages> {
  const { languages, chosen, fromCountry } = await answerLanguagesIn(actor.workspaceId);
  return { languages, chosen, fromCountry };
}

/** Sets the languages answers are read in, for Owners and Admins; audited. Only languages Ziffr has words for, at
 * least one. Once set they no longer follow the country. */
export async function setAnswerLanguages(actor: Actor, input: unknown): Promise<string[]> {
  assertManages(actor, "Answer Languages");
  const languages = checkAnswerLanguages(input);
  if (!languages) throw new Error("Pick at least one of the Answer Languages from the list.");
  const before = await answerLanguagesIn(actor.workspaceId);
  if (before.chosen && before.languages.join() === languages.join()) return languages;
  const { error } = await db().from("workspaces").update({ answer_languages: languages }).eq("id", actor.workspaceId);
  if (error) throw new Error("The Answer Languages could not be saved.");
  // Codes from the list only, or null for languages that followed the country (or the default, without one):
  // nothing a person typed.
  await audit(actor, { kind: "workspace.answer_languages_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before.chosen ? before.languages : null, ...(before.chosen ? {} : { followed: before.country ? "country" : "default" }), to: languages } });
  return languages;
}

/** The Attainment method of a workspace (GLOSSARY: Attainment), for code that has already checked who may see it:
 * what Metrics without one of their own are computed with. */
export async function attainmentMethodOf(workspaceId: string): Promise<AttainmentMethod> {
  const { data } = await db().from("workspaces").select("attainment_method").eq("id", workspaceId).maybeSingle();
  return isAttainmentMethod(data?.attainment_method) ? data.attainment_method : DEFAULT_ATTAINMENT_METHOD;
}

/** The actor's workspace's Attainment method, for any member (a Guest too: every Attainment they see uses it). */
export async function workspaceAttainmentMethod(actor: Pick<Actor, "workspaceId">): Promise<AttainmentMethod> {
  return attainmentMethodOf(actor.workspaceId);
}

/** Sets the workspace's Attainment method, for Owners and Admins; audited. Metrics with a method of their own keep
 * it; Snapshots and frozen View Links keep the one they were made with. */
export async function setAttainmentMethod(actor: Actor, method: unknown): Promise<AttainmentMethod> {
  assertManages(actor, "Attainment method");
  if (!isAttainmentMethod(method)) throw new Error("Pick an Attainment method from the list: ratio or distance.");
  const before = await attainmentMethodOf(actor.workspaceId);
  if (before === method) return method;
  const { error } = await db().from("workspaces").update({ attainment_method: method }).eq("id", actor.workspaceId);
  if (error) throw new Error("The Attainment method could not be saved.");
  // Two keys, nothing a person typed.
  await audit(actor, { kind: "workspace.attainment_method_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before, to: method } });
  return method;
}
