#!/usr/bin/env node
// The Pack kit's command (GLOSSARY: Pack): `npx @ziffr/pack check my.pack.json` runs on a file exactly the checks Ziffr
// runs before it shows or installs a Pack (run.ts), prints what is wrong with each problem's line, and ends with 1.
import { run } from "./run.js";

const { out, code } = run(process.argv.slice(2));
for (const line of out) (code === 0 ? console.log : console.error)(line);
process.exit(code);
