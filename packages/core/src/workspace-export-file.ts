// The Workspace Export as a stream of bytes (GLOSSARY: Workspace Export): a writer that turns records into the lines of
// a file, optionally gzipped, and a reader that turns an untrusted stream of bytes back into checked records, one at a
// time. The format and its checks live in @ziffr/pack (MIT); this module only moves bytes and has no database, so
// the export (#681) and the import (#682) share exactly one reader and one writer.
// Security: the reader caps the size of the file and of the unzipped text while it reads, never after, so a
// zip bomb or an endless stream stops at the cap; it refuses a line with no end within the line limit, text that is
// not UTF-8, and any record the format's checks refuse, with its line. The writer checks what it writes with the same
// checks, so it can never write a file the reader would refuse, and a secret field cannot be written at all.
import { createGunzip, createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { WORKSPACE_EXPORT_LIMITS, WorkspaceExportChecker, type WorkspaceExportReaderLimits, type WorkspaceExportRecord } from "@ziffr/pack/workspace-export";
import type { Problem } from "@ziffr/pack/json-check";

/** The sizes the reader holds a file to unless an Installation setting says otherwise. */
export const DEFAULT_READER_LIMITS: WorkspaceExportReaderLimits = { fileBytes: WORKSPACE_EXPORT_LIMITS.fileBytes, textBytes: WORKSPACE_EXPORT_LIMITS.textBytes };

/** A file refused: every problem found, the first with its line. Nothing was written anywhere. */
export class WorkspaceExportProblem extends Error {
  constructor(readonly problems: Problem[]) {
    super(problems.map((p) => `${p.line ? `line ${p.line}: ` : ""}${p.path ? `${p.path} ` : ""}${p.message}`).join("\n"));
    this.name = "WorkspaceExportProblem";
  }
}
const refuse = (message: string, line: number | null = null): never => {
  throw new WorkspaceExportProblem([{ path: "", line, message }]);
};

/** Bytes of `chunk`, whatever the stream gave. */
const bytes = (chunk: unknown): Uint8Array => (typeof chunk === "string" ? new TextEncoder().encode(chunk) : (chunk as Uint8Array));

/** The text of a stream of bytes: gunzipped when it starts with the gzip mark, within both size limits. */
async function* textOf(input: AsyncIterable<Uint8Array>, limits: WorkspaceExportReaderLimits): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let compressed = 0;
  let text = 0;
  const counted = async function* () {
    for await (const chunk of input) {
      const b = bytes(chunk);
      compressed += b.length;
      if (compressed > limits.fileBytes) refuse(`The file is larger than ${limits.fileBytes.toLocaleString("en")} bytes, which is the most this Installation reads.`);
      yield b;
    }
  };
  // The first two bytes say whether it is gzip, so they are read before anything else, however small the pieces are.
  const first = counted()[Symbol.asyncIterator]();
  const head: Uint8Array[] = [];
  let headLength = 0;
  while (headLength < 2) {
    const next = await first.next();
    if (next.done) break;
    head.push(next.value);
    headLength += next.value.length;
  }
  if (headLength === 0) return;
  const rest = async function* () {
    yield* head;
    for (;;) {
      const next = await first.next();
      if (next.done) return;
      yield next.value;
    }
  };
  const mark = Buffer.concat(head.slice(0, 2)).subarray(0, 2);
  const gzipped = mark.length === 2 && mark[0] === 0x1f && mark[1] === 0x8b;
  let source: AsyncIterable<Uint8Array>;
  let cleanup = () => {};
  if (gzipped) {
    const from = Readable.from(rest(), { objectMode: false });
    const gunzip = createGunzip();
    from.on("error", (e) => gunzip.destroy(e));
    from.pipe(gunzip);
    cleanup = () => {
      from.destroy();
      gunzip.destroy();
    };
    source = gunzip;
  } else source = rest();
  try {
    for await (const chunk of source) {
      const b = bytes(chunk);
      text += b.length;
      if (text > limits.textBytes) refuse(`The text of the file is larger than ${limits.textBytes.toLocaleString("en")} bytes, which is the most this Installation reads.`);
      try {
        yield decoder.decode(b, { stream: true });
      } catch {
        return refuse("The file is not text in UTF-8.");
      }
    }
    try {
      const tail = decoder.decode();
      if (tail) yield tail;
    } catch {
      return refuse("The file ends in the middle of a character: it may have been cut off.");
    }
  } catch (e) {
    if (e instanceof WorkspaceExportProblem) throw e;
    return refuse(gzipped ? "The file is not a complete, valid gzip file." : "The file could not be read.");
  } finally {
    cleanup();
  }
}

/** One record of a file with the line it stands on. */
export type ReadRecord = { record: WorkspaceExportRecord; line: number };

/**
 * Reads a Workspace Export from a stream of bytes (plain or gzipped) and yields each checked record with its line,
 * without holding the file. It throws a `WorkspaceExportProblem` at the first line the format's checks refuse, and at
 * the end if the file as a whole is wrong (no end record, counts that differ); a reader that writes as it goes
 * (the import) must be ready to throw its work away. Sizes are the limits given, or the defaults.
 */
export async function* readWorkspaceExport(input: AsyncIterable<Uint8Array>, limits: WorkspaceExportReaderLimits = DEFAULT_READER_LIMITS): AsyncGenerator<ReadRecord> {
  const checker = new WorkspaceExportChecker();
  let pending = "";
  let first = true;
  const lineOf = function* (text: string, last: boolean): Generator<string> {
    pending += text;
    for (;;) {
      const at = pending.indexOf("\n");
      if (at < 0) break;
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      yield line.endsWith("\r") ? line.slice(0, -1) : line;
    }
    // A line that has not ended after the longest line a record may be is not a record.
    if (pending.length > WORKSPACE_EXPORT_LIMITS.lineBytes) refuse(`A line is longer than ${WORKSPACE_EXPORT_LIMITS.lineBytes.toLocaleString("en")} characters.`, checker.lines + 1);
    if (last && pending !== "") {
      const line = pending;
      pending = "";
      yield line.endsWith("\r") ? line.slice(0, -1) : line;
    }
  };
  const check = function* (line: string): Generator<ReadRecord> {
    const res = checker.line(line);
    if (!res.ok) throw new WorkspaceExportProblem(res.problems);
    yield { record: res.record, line: checker.lines };
  };
  for await (let text of textOf(input, limits)) {
    if (first) {
      text = text.replace(/^﻿/, "");
      first = false;
    }
    for (const line of lineOf(text, false)) yield* check(line);
  }
  for (const line of lineOf("", true)) yield* check(line);
  const problems = checker.finish();
  if (problems.length) throw new WorkspaceExportProblem(problems);
}

/** Reads a Workspace Export held as text or bytes (a small file, a test or a command), into all its records. */
export async function readWorkspaceExportAll(file: string | Uint8Array, limits: WorkspaceExportReaderLimits = DEFAULT_READER_LIMITS): Promise<ReadRecord[]> {
  const out: ReadRecord[] = [];
  for await (const r of readWorkspaceExport(Readable.from([typeof file === "string" ? new TextEncoder().encode(file) : file]), limits)) out.push(r);
  return out;
}

/** What a writer is told: whether to gzip. */
export type WriterOptions = { gzip?: boolean };

/** The records of a file as the lines of its text: each checked by the format's own checks as it passes, and the end
 * record written from what passed, so a file cannot be cut or miscounted by the code that makes it. */
async function* linesOf(records: AsyncIterable<WorkspaceExportRecord> | Iterable<WorkspaceExportRecord>): AsyncGenerator<string> {
  const checker = new WorkspaceExportChecker();
  const write = (record: unknown) => {
    const text = JSON.stringify(record);
    const res = checker.line(text);
    if (!res.ok) throw new WorkspaceExportProblem(res.problems);
    return `${text}\n`;
  };
  for await (const record of records) {
    // The writer makes the end record itself: a caller's would be a count it could get wrong.
    if (record.kind === "end") refuse("The end record is written by the writer, not given to it.");
    yield write(record);
  }
  yield write({ kind: "end", counts: { ...checker.recordCounts } });
  const problems = checker.finish();
  if (problems.length) throw new WorkspaceExportProblem(problems);
}

/**
 * Writes a Workspace Export as a stream of bytes, plain or gzipped, from a header and the records after it, in the
 * order the format needs. Nothing is held but the labels the checks keep. Throws a `WorkspaceExportProblem` with the
 * line when a record would not pass the reader; the caller streaming it to a person must then end the response with
 * an error rather than a short file.
 */
export function writeWorkspaceExport(records: AsyncIterable<WorkspaceExportRecord> | Iterable<WorkspaceExportRecord>, options: WriterOptions = {}): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const plain = async function* () {
    for await (const line of linesOf(records)) yield encoder.encode(line);
  };
  if (!options.gzip) return plain();
  const gzip = createGzip();
  const source = Readable.from(plain(), { objectMode: false });
  source.on("error", (e) => gzip.destroy(e));
  source.pipe(gzip);
  return (async function* () {
    try {
      for await (const chunk of gzip) yield chunk as Uint8Array;
    } finally {
      source.destroy();
      gzip.destroy();
    }
  })();
}

/** Writes a small Workspace Export into one piece of bytes (a test, a command). */
export async function writeWorkspaceExportAll(records: Iterable<WorkspaceExportRecord>, options: WriterOptions = {}): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of writeWorkspaceExport(records, options)) parts.push(chunk);
  return Buffer.concat(parts);
}
