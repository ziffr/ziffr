@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` block edits to `.env*` and to existing migrations, fix lint on the files you edit, and run typecheck and lint before you stop when source files changed. If a hook reports a problem, fix it rather than working around it.
- Bash runs in Claude Code's sandbox: it writes only inside the worktree and reaches only the npm registry and GitHub. Outside it run `docker`, `supabase`, `gh` (its TLS check fails inside), `pnpm install`/`add` (packages ship `.idea` folders the sandbox will not let it write), `pnpm ci:local` and `pnpm prototype` (they call docker and supabase themselves); `pnpm ci:local --quick` runs inside. The guard hook is a speed bump, the sandbox is the boundary.
- Use the domain-modeling discipline for names: challenge a fuzzy term against `GLOSSARY.md` before inventing one.
- When you change who can see or do what, ask for a security review of the diff before calling it done.
