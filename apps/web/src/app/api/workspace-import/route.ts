// POST /api/workspace-import (spec 0040, ticket 9; GLOSSARY: Workspace Export): receives the file of a Workspace Export
// as the raw body, writes it to a temporary file within the size limit while it arrives, and starts the import job
// (core: startWorkspaceImport), which reads and deletes the file. It answers with the job's id; the progress page
// follows it. Only for a signed-in person on an Installation that is not hosted Ziffr.
// Security: the upload is untrusted. The size is counted as the bytes arrive and the stream is stopped at the limit,
// never after; the file is made readable by this process only and is deleted when the job ends or the upload fails.
// A browser of another site cannot send this request: it carries a header that makes a cross-site request ask first,
// and the session cookie is SameSite=Lax. Nothing of the file's content is looked at here.
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertMayImport, importLimits, importOffered, startWorkspaceImport } from "@ziffr/core/workspace-import";
import { forPeople } from "@/lib/action-result";
import { isDemo, personFor, sessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uploads that stall are cut after this long. */
const UPLOAD_MS = 15 * 60_000;

/** Removes uploads an earlier process left behind (it stopped before its job ended): none is older than an hour. */
async function sweep() {
  for (const name of await readdir(tmpdir()).catch(() => [] as string[])) {
    if (!/^ziffr-import-[0-9a-f-]{36}$/.test(name)) continue;
    const old = await stat(join(tmpdir(), name)).then((s) => Date.now() - s.mtimeMs > 3_600_000, () => false);
    if (old) await rm(join(tmpdir(), name), { force: true });
  }
}

const say = (error: string, status: number) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/** Takes the file and starts the import. */
export async function POST(req: Request) {
  if (!importOffered()) return say("A new Workspace on hosted Ziffr is a trial: import a Workspace Export on an Installation of your own.", 403);
  if (req.headers.get("x-ziffr-import") !== "1" || !req.body) return say("Send the file as the body of the request.", 400);
  const user = await sessionUser();
  if (!user || (await isDemo())) return say("Sign in to import a Workspace.", 401);
  const person = await personFor(user);
  const { fileBytes } = importLimits();
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > fileBytes) return say(`The file is larger than ${fileBytes.toLocaleString("en")} bytes, which is the most this Installation reads.`, 413);
  // Refused before a byte is written: a person who may not import, or one who has an import running, fills no disk.
  try {
    await assertMayImport(person);
  } catch (e) {
    return say(forPeople(e) ?? "The import could not be started.", 400);
  }
  await sweep();
  const path = join(tmpdir(), `ziffr-import-${randomUUID()}`);
  let size = 0;
  const count = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      done(size > fileBytes ? new Error("too large") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as never), count, createWriteStream(path, { mode: 0o600 }), { signal: AbortSignal.timeout(UPLOAD_MS) });
  } catch {
    await rm(path, { force: true });
    return size > fileBytes ? say(`The file is larger than ${fileBytes.toLocaleString("en")} bytes, which is the most this Installation reads.`, 413) : say("The upload was cut off. Try again.", 400);
  }
  try {
    const { id } = await startWorkspaceImport(person, path);
    return Response.json({ id }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return say(forPeople(e) ?? "The import could not be started.", 400);
  }
}
