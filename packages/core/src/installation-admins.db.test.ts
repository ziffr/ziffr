// Installation Admins against the real database (spec 0025, ticket #196): claiming with the setup code (once, never
// again, wrong codes refused and limited), who may add and remove admins, never the last one, and the server's list.
// The Installation is one per database, so each test starts from no admins and the rows found before are put back.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addInstallationAdmin, claimInstallation, installationAdmins, installationClaimed, installationEvents, isInstallationAdmin, newSetupCode,
  prepareSetupCode, removeInstallationAdmin, setupCodeHash, SETUP_CODE_TRIES_PER_HOUR,
} from "./installation-admins";

let before: { person_id: string; added_by: string | null; added_at: string }[] = [];
const people: string[] = [];
const accounts: string[] = [];
const savedEnv = process.env.ZIFFR_INSTALLATION_ADMINS;

beforeAll(async () => { before = ((await db().from("installation_admins").select("*")).data ?? []) as typeof before; });
afterAll(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  if (before.length) await db().from("installation_admins").insert(before);
});
beforeEach(async () => {
  delete process.env.ZIFFR_INSTALLATION_ADMINS;
  await db().from("installation_admins").delete().neq("person_id", "");
  await db().from("installation_setup_codes").delete().eq("id", true);
  await db().from("installation_claim_tries").delete().neq("person_id", "");
});
afterEach(async () => {
  if (savedEnv === undefined) delete process.env.ZIFFR_INSTALLATION_ADMINS; else process.env.ZIFFR_INSTALLATION_ADMINS = savedEnv;
  await db().from("installation_admins").delete().in("person_id", people);
  if (people.length) await db().from("profiles").delete().in("id", people.splice(0));
  for (const id of accounts.splice(0)) await db().auth.admin.deleteUser(id).catch(() => {});
});

/** A person who signed in (`signedIn`), or one with no sign-in, like a Contact or a demo person. */
async function person(opts: { signedIn?: boolean; email?: string } = {}) {
  const id = `t-${randomUUID()}`;
  people.push(id);
  const email = opts.email ?? `p-${id.slice(2, 10)}@example.test`;
  let auth: string | null = null;
  if (opts.signedIn !== false) {
    const { data } = await db().auth.admin.createUser({ email: `auth-${id.slice(2, 10)}@example.test`, email_confirm: true });
    auth = data.user!.id;
    accounts.push(auth);
  }
  const { error } = await db().from("profiles").insert({ id, name: `Person ${id.slice(2, 6)}`, role: "", color: "#000", email, auth_user_id: auth });
  if (error) throw error;
  return { personId: id, email };
}

/** A setup code that waits, as the server would have printed it. */
async function codeInLog() {
  let code = "";
  expect(await prepareSetupCode({ fresh: true }, (c) => { code = c; })).toBe("printed");
  return code;
}

describe("claiming the Installation with the setup code", () => {
  it("stores only the code's hash, and prints a new one at start", async () => {
    const code = await codeInLog();
    const { data } = await db().from("installation_setup_codes").select("code_hash").single();
    expect(data!.code_hash).toBe(setupCodeHash(code));
    expect(data!.code_hash).not.toContain(code.replace(/-/g, ""));
    // The claim page prints none while one waits; a start always makes a new one.
    expect(await prepareSetupCode({ fresh: false }, () => { throw new Error("printed again"); })).toBe("waiting");
    const again = await codeInLog();
    expect(again).not.toBe(code);
    expect(newSetupCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it("makes the first person with the right code an Installation Admin, once", async () => {
    const code = await codeInLog();
    const ann = await person();
    const ben = await person();
    expect(await installationClaimed()).toBe(false);
    // Typed in lower case, without dashes: still the code.
    await claimInstallation(ann, code.toLowerCase().replace(/-/g, " "));
    expect(await isInstallationAdmin(ann)).toBe(true);
    expect(await installationClaimed()).toBe(true);
    // The code is gone, and nobody claims it again, with it or with a new one.
    expect((await db().from("installation_setup_codes").select("id")).data).toHaveLength(0);
    await expect(claimInstallation(ben, code)).rejects.toThrow(/already/);
    expect(await prepareSetupCode({ fresh: true }, () => { throw new Error("printed"); })).toBe("claimed");
    expect(await isInstallationAdmin(ben)).toBe(false);
    expect((await installationEvents(ann)).some((e) => e.kind === "installation.claimed")).toBe(true);
  });

  it("refuses a wrong code, and after a few an hour refuses the right one too", async () => {
    const code = await codeInLog();
    const eve = await person();
    for (let i = 0; i < SETUP_CODE_TRIES_PER_HOUR; i++) await expect(claimInstallation(eve, newSetupCode())).rejects.toThrow(/not the setup code/);
    await expect(claimInstallation(eve, code)).rejects.toThrow(/Too many/);
    expect(await isInstallationAdmin(eve)).toBe(false);
    // Counted per person: Eve's tries do not use up the code the operator just read.
    const op = await person();
    await claimInstallation(op, code);
    expect(await isInstallationAdmin(op)).toBe(true);
  });

  it("is never claimed by someone without a sign-in, or while the server names its admins", async () => {
    const code = await codeInLog();
    const contact = await person({ signedIn: false });
    await expect(claimInstallation(contact, code)).rejects.toThrow(/Sign in/);
    await expect(claimInstallation({ personId: "sara" }, code)).rejects.toThrow(/Sign in/);
    process.env.ZIFFR_INSTALLATION_ADMINS = "ops@example.test";
    const ann = await person();
    await expect(claimInstallation(ann, code)).rejects.toThrow(/named on the server/);
    expect(await prepareSetupCode({ fresh: true }, () => { throw new Error("printed"); })).toBe("claimed");
  });

  it("lets only one of two people with the right code at the same moment claim it", async () => {
    const code = await codeInLog();
    const [a, b] = [await person(), await person()];
    const results = await Promise.allSettled([claimInstallation(a, code), claimInstallation(b, code)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db().from("installation_admins").select("person_id")).data).toHaveLength(1);
  });
});

describe("adding and removing Installation Admins", () => {
  async function claimed() {
    const code = await codeInLog();
    const admin = await person();
    await claimInstallation(admin, code);
    return admin;
  }

  it("adds someone who signed in, by their address, and only an admin may", async () => {
    const admin = await claimed();
    const ben = await person();
    const contact = await person({ signedIn: false });
    await expect(addInstallationAdmin(ben, ben.email)).rejects.toThrow(/Only Installation Admins/);
    await expect(addInstallationAdmin(admin, contact.email)).rejects.toThrow(/Nobody has signed in/);
    await expect(addInstallationAdmin(admin, "nobody@example.test")).rejects.toThrow(/Nobody has signed in/);
    await expect(addInstallationAdmin(admin, "not an address")).rejects.toThrow(/one email address/);
    await addInstallationAdmin(admin, ` ${ben.email.toUpperCase()} `);
    expect(await isInstallationAdmin(ben)).toBe(true);
    await expect(addInstallationAdmin(admin, ben.email)).rejects.toThrow(/already/);
    const list = await installationAdmins(admin);
    expect(list.map((a) => a.personId).sort()).toEqual([admin.personId, ben.personId].sort());
    expect(list.find((a) => a.personId === admin.personId)!.you).toBe(true);
    await expect(installationAdmins(contact)).rejects.toThrow(/Only Installation Admins/);
    expect((await installationEvents(admin)).map((e) => e.kind)).toContain("installation_admin.added");
  });

  it("removes others and oneself, never the last one", async () => {
    const admin = await claimed();
    const ben = await person();
    await expect(removeInstallationAdmin(admin, admin.personId)).rejects.toThrow(/last Installation Admin/);
    await addInstallationAdmin(admin, ben.email);
    await expect(removeInstallationAdmin(await person(), ben.personId)).rejects.toThrow(/Only Installation Admins/);
    await removeInstallationAdmin(ben, admin.personId);
    expect(await isInstallationAdmin(admin)).toBe(false);
    await expect(removeInstallationAdmin(ben, ben.personId)).rejects.toThrow(/last/);
    await expect(removeInstallationAdmin(ben, admin.personId)).rejects.toThrow(/not an Installation Admin added here/);
  });

  it("leaves one when two remove each other at the same moment", async () => {
    const admin = await claimed();
    const ben = await person();
    await addInstallationAdmin(admin, ben.email);
    await Promise.allSettled([removeInstallationAdmin(admin, ben.personId), removeInstallationAdmin(ben, admin.personId)]);
    expect((await db().from("installation_admins").select("person_id")).data).toHaveLength(1);
  });

  it("counts people the server names, who cannot be removed here", async () => {
    const ops = await person();
    const contact = await person({ signedIn: false, email: `c-${randomUUID().slice(0, 8)}@example.test` });
    process.env.ZIFFR_INSTALLATION_ADMINS = `${ops.email}, ${contact.email}, later@example.test`;
    // Signed in with a named address: an Installation Admin. A Contact with one is not.
    expect(await isInstallationAdmin(ops)).toBe(true);
    expect(await isInstallationAdmin(contact)).toBe(false);
    const ben = await person();
    await addInstallationAdmin(ops, ben.email);
    // The last one on the page may go: the server still names someone who can sign in.
    await removeInstallationAdmin(ben, ben.personId);
    const list = await installationAdmins(ops);
    expect(list.filter((a) => a.from === "server").map((a) => a.email)).toEqual([ops.email, contact.email, "later@example.test"]);
    expect(list.find((a) => a.email === "later@example.test")!.personId).toBeNull();
  });

  it("keeps every table away from the public roles", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { execFileSync } = await import("node:child_process");
    let anon = process.env.SUPABASE_ANON_KEY;
    if (!anon) {
      try { anon = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).ANON_KEY; } catch { anon = undefined; }
    }
    if (!anon) return;
    const pub = createClient(process.env.SUPABASE_URL!, anon, { auth: { persistSession: false } });
    for (const table of ["installation_admins", "installation_setup_codes", "installation_claim_tries", "installation_audit_events"]) {
      const { data } = await pub.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
    const { error } = await pub.rpc("claim_installation", { p_person: "x", p_code_hash: "0".repeat(64), p_tries_per_hour: 5 });
    expect(error).not.toBeNull();
  });
});
