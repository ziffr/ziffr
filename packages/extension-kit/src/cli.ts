#!/usr/bin/env node
// The Extension Kit's command (GLOSSARY: Extension Kit): `npx @ziffr/extension-kit check ./my-extension` runs on a
// folder the checks Ziffr runs before it reads an Extension, prints what is wrong with each problem's file and line, and ends with 1.
import { run } from "./run.js";

const { out, code } = await run(process.argv.slice(2));
for (const line of out) (code === 0 ? console.log : console.error)(line);
process.exit(code);
