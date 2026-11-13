#!/usr/bin/env node
// Prints the release notes of one version, exactly its CHANGELOG.md section (ADR 0004). Used by the release
// workflow, so the GitHub release and the changelog cannot differ. Usage: node scripts/release-notes.mjs v0.2.0
import { readFileSync } from "node:fs";
import { sectionOf } from "./release-lib.mjs";

const version = String(process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Give a version like v0.2.0.");
const notes = sectionOf(readFileSync("CHANGELOG.md", "utf8"), version);
if (!notes) throw new Error(`CHANGELOG.md has no section for ${version}.`);
process.stdout.write(notes);
