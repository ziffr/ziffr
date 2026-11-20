// /cal/<secret>.ics over HTTP (spec 0027, ticket #243; GLOSSARY: Calendar Link): a calendar file for a working link,
// kept private to whoever holds it, the same ETag answering 304, and the same 404 for a malformed, unknown or revoked
// address.
import { afterEach, describe, expect, it } from "vitest";
import { makeCalendarLink, revokeCalendarLink } from "@ziffr/core/calendar-links";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const get = (file: string, headers: Record<string, string> = {}) => GET(new Request(`http://ziffr.test/cal/${file}`, { headers }), { params: Promise.resolve({ file }) });

describe("GET /cal/<secret>.ics", () => {
  it("answers the calendar privately, 304 for the same ETag, and 404 once revoked", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const { secret } = await makeCalendarLink(w.actor(sara));
    const res = await get(`${secret}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, max-age=900");
    const body = await res.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    const etag = res.headers.get("etag")!;
    expect((await get(`${secret}.ics`, { "if-none-match": etag })).status).toBe(304);
    await revokeCalendarLink(w.actor(sara));
    for (const file of [`${secret}.ics`, secret, `${"A".repeat(43)}.ics`, "x.ics"]) {
      const gone = await get(file);
      expect(gone.status).toBe(404);
      expect(await gone.text()).toBe("Not found.");
    }
  });
});
