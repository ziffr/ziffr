// @ts-nocheck
import { describe, expect, it } from "vitest";
import { cleanContact, peopleOf, recogniseSender, type ContactRow } from "./people";
import type { Profile } from "./types";

const person = (id: string, over: Partial<Profile> = {}): Profile => ({ id, name: id, role: "", color: "#000", slack_handle: "", email: "", ...over });
const contact = (person_id: string, over: Partial<ContactRow> = {}): ContactRow => ({ workspace_id: "A", person_id, email: null, slack_handle: null, phone: null, ...over });

describe("people of a workspace", () => {
  const members = [person("sara", { email: "sara@a.test", slack_handle: "@sara" })];
  it("adds Contacts with the details this workspace keeps for them", () => {
    const people = peopleOf("A", members, [contact("cleo", { email: "cleo@field.test", slack_handle: "@cleo" })], [person("cleo")]);
    expect(people.map((p) => [p.id, p.contact])).toEqual([["sara", false], ["cleo", true]]);
    expect(people[1]).toMatchObject({ email: "cleo@field.test", slack_handle: "@cleo" });
  });
  it("leaves out Contacts of other workspaces, and counts a member who is also a contact as a member", () => {
    const people = peopleOf("A", members, [contact("cleo", { workspace_id: "B", email: "c@b.test" }), contact("sara", { email: "other@a.test" })], [person("cleo"), person("sara")]);
    expect(people.map((p) => p.id)).toEqual(["sara"]);
    expect(people[0].email).toBe("sara@a.test");
  });
  it("recognises a sender by Slack handle or address, without case, and nobody for empty or unknown senders", () => {
    const people = peopleOf("A", members, [contact("cleo", { email: "cleo@field.test", slack_handle: "@cleo" })], [person("cleo")]);
    expect(recogniseSender(people, "slack", "@Cleo")?.id).toBe("cleo");
    expect(recogniseSender(people, "mail", " CLEO@field.test ")?.id).toBe("cleo");
    expect(recogniseSender(people, "mail", "sara@a.test")?.id).toBe("sara");
    expect(recogniseSender(people, "slack", "@nobody")).toBeUndefined();
    expect(recogniseSender([person("x")], "mail", "")).toBeUndefined();
  });
});

describe("a Contact's details", () => {
  it("keeps a name and at least one way to reach them, cleaned up", () => {
    expect(cleanContact({ name: " Cleo ", email: "Cleo@Field.test", slackHandle: "cleo" })).toEqual({ ok: true, name: "Cleo", email: "cleo@field.test", slack_handle: "@cleo", phone: null });
  });
  it("refuses a contact without name or way to reach them, and malformed details", () => {
    expect(cleanContact({ name: "", email: "a@b.test" }).ok).toBe(false);
    expect(cleanContact({ name: "Cleo" }).ok).toBe(false);
    expect(cleanContact({ name: "Cleo", email: "not-an-address" }).ok).toBe(false);
    expect(cleanContact({ name: "Cleo", slackHandle: "@bad handle" }).ok).toBe(false);
    expect(cleanContact({ name: "Cleo", phone: "call me" }).ok).toBe(false);
  });
});
