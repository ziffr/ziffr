// Which errors a server action answers as `{ error }` (ticket 192): Ziffr's own words, never a programming error or a
// provider's text, and never a redirect, which Next.js must see thrown.
import { describe, expect, it } from "vitest";
import { redirect } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { attempt, forPeople } from "./action-result";

describe("server action refusals", () => {
  it("answers Ziffr's own words and a refusal, nothing else", () => {
    expect(forPeople(new Error("Give the Metric a name."))).toBe("Give the Metric a name.");
    expect(forPeople(new Forbidden("Only Owners and Admins manage Feeds."))).toBe("Only Owners and Admins manage Feeds.");
    expect(forPeople(new Forbidden())).toBe("You may not do that here.");
    expect(forPeople(new TypeError("Cannot read properties of undefined"))).toBeNull();
    class ProviderError extends Error {}
    expect(forPeople(new ProviderError("smtp 550 at host x"))).toBeNull();
    expect(forPeople("a string")).toBeNull();
  });

  it("returns a refusal, throws the unexpected on, and lets a redirect through", async () => {
    await expect(attempt(async () => { throw new Error("Pick an end date within a year."); })).resolves.toEqual({ error: "Pick an end date within a year." });
    await expect(attempt(async () => 42)).resolves.toBe(42);
    const quiet = console.error; console.error = () => {};
    await expect(attempt(async () => { throw new TypeError("x is undefined"); })).rejects.toBeInstanceOf(TypeError);
    console.error = quiet;
    await expect(attempt(async () => redirect("/somewhere"))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});
