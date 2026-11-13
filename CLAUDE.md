@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` block edits to `.env*` and to existing migrations, fix lint on the files you edit, and run typecheck and lint before you stop when source files changed. If a hook reports a problem, fix it rather than working around it.
- Use the domain-modeling discipline for names: challenge a fuzzy term against `GLOSSARY.md` before inventing one.
- When you change who can see or do what, ask for a security review of the diff before calling it done.
