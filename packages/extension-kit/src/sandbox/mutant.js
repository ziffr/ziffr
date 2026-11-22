// The command Stryker runs for each changed copy of an Extension's Method (GLOSSARY: Extension Kit): it runs the changed
// Method on every input the checker settled on and compares each answer with the answer that is right (the hand-worked
// case, or the reference). It ends with 0 when every answer is right, which means the change went unnoticed, and with 1 at
// the first wrong one, which means a test caught it. It runs from the folder Stryker copied the Extension into.
import { readFileSync } from "node:fs";
import { decode, same } from "./wire.js";
import { prepareExtension, runChild } from "./spawn.js";

const job = JSON.parse(readFileSync("ziffr-job.json", "utf8"));
const files = new Map([[job.file, readFileSync(job.file, "utf8")]]);
const prepared = prepareExtension(files);
let wrong = false;
try {
  const res = await runChild(
    prepared,
    { op: "run", file: job.file.replace(/\.ts$/, ".js"), prefer: "", inputs: job.inputs, coverage: false, stryker: true },
    {
      mutant: process.env.__STRYKER_ACTIVE_MUTANT__,
      perCallMs: job.perCallMs,
      heapMb: job.heapMb,
      totalMs: 30_000,
      onEvent(ev) {
        if (!("i" in ev)) return undefined;
        const want = job.expect[ev.i];
        if (want === undefined || !("out" in ev)) wrong = true;
        else if (want.refused !== undefined) wrong = !same({ refused: "" }, decode(ev.out)) || (want.refused !== "" && decode(ev.out).refused !== want.refused);
        else wrong = !same(decode(want.answer), decode(ev.out), job.relative);
        return wrong;
      },
    },
  );
  if (res.end !== "done" && res.end !== "aborted") wrong = true;
} finally {
  prepared.cleanup();
}
process.exit(wrong ? 1 : 0);
