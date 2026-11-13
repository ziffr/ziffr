## What and why

<!-- What changes for users or contributors, and why. Link the issue. -->

## Evidence

<!-- Screenshots before and after for UI changes. Test output or steps for the rest. -->

## Checklist

- [ ] Uses glossary terms; `GLOSSARY.md` updated if a concept is new or changed
- [ ] ADR added if the decision is hard to reverse, surprising and a real trade-off
- [ ] Exported code has doc comments; modules have a header comment; comments say why
- [ ] Guides updated, and a release note in `.changeset/` (`pnpm changeset`) for anything users or self-hosters notice
- [ ] Tests added or changed; typecheck and lint pass
- [ ] Migrations are new files only; nothing merged was edited

## Security impact

<!-- Answer each, "no" is a fine answer. -->

- New way to read or change data? Through the core, with a permission check?
- Changes who can see what (Shares, Groups, Tokens, Stand-ins, View Links)?
- New public surface (API route, MCP tool, connector, link)?
