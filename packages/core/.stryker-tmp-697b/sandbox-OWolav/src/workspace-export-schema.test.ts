// @ts-nocheck
// The published schema of the Workspace Export (GLOSSARY: Workspace Export): docs/reference holds exactly what the
// checks run, generated, never written by hand; and another JSON Schema validator agrees with it on every record.
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { WORKSPACE_EXPORT_SCHEMA } from "@ziffr/pack/workspace-export";
import { repoFile } from "./test/repo-file";

describe("the published Workspace Export schema", () => {
  it("is the one the checks run", () => {
    // UPDATE_REFERENCE=1 writes it.
    const path = repoFile("docs/reference/workspace-export.schema.json");
    const generated = `${JSON.stringify(WORKSPACE_EXPORT_SCHEMA, null, 2)}\n`;
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });

  it("is a JSON Schema another validator reads, and refuses what ours refuses at the record's own level", () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(WORKSPACE_EXPORT_SCHEMA);
    expect(validate({ kind: "group", id: "g1", name: "Sales" })).toBe(true);
    expect(validate({ kind: "group", id: "g1", name: "Sales", accessKey: "x" })).toBe(false);
    expect(validate({ kind: "group", id: "__proto__", name: "Sales" })).toBe(false);
    expect(validate({ kind: "value", metric: "m1", period: "2026-01-01", value: 1e300 })).toBe(false);
    expect(validate({ kind: "alert" })).toBe(false);
  });

  it("is described in the reference, which names every kind of record", () => {
    const text = readFileSync(repoFile("docs/reference/workspace-export.md"), "utf8");
    for (const branch of WORKSPACE_EXPORT_SCHEMA.oneOf!) expect(text, String(branch.properties!.kind.const)).toContain(`\`${branch.properties!.kind.const}\``);
  });
});
