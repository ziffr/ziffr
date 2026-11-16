#!/usr/bin/env node
// Starts a command with the Supabase anon key sign-in needs (and the address, when not set). Locally they come from
// `supabase status` (the anon key is public by design); where they are already set, nothing is changed.
import { execFileSync, spawn } from "node:child_process";

const env = { ...process.env };
if (!env.SUPABASE_ANON_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  try {
    const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    env.NEXT_PUBLIC_SUPABASE_URL ??= status.API_URL;
    env.SUPABASE_ANON_KEY ??= status.ANON_KEY;
  } catch {
    console.warn("Could not read `supabase status`; is local Supabase running? Sign-in will not work.");
  }
}
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 1));
