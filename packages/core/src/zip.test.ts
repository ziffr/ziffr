// The ZIP file of a Metric Record (spec 0065): a standard unzip reads it, with every file whole.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipFile } from "./zip";

const has = (() => { try { execFileSync("unzip", ["-v"]); return true; } catch { return false; } })();

describe("zipFile", () => {
  it.skipIf(!has)("makes a file that unzip checks and reads", () => {
    const dir = mkdtempSync(join(tmpdir(), "ziffr-zip-"));
    try {
      const path = join(dir, "record.zip");
      const long = "wert;Müller\r\n".repeat(5000);
      writeFileSync(path, zipFile([{ name: "README.txt", data: Buffer.from("hello") }, { name: "revenue/values.csv", data: Buffer.from(long) }, { name: "empty.csv", data: Buffer.alloc(0) }], new Date("2026-11-27T10:00:00Z")));
      expect(execFileSync("unzip", ["-t", path]).toString()).toContain("No errors detected");
      expect(execFileSync("unzip", ["-p", path, "revenue/values.csv"], { maxBuffer: 10_000_000 }).toString()).toBe(long);
      expect(execFileSync("unzip", ["-p", path, "README.txt"]).toString()).toBe("hello");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
