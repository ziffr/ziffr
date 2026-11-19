# Release notes waiting for the next release

Every pull request that changes what people use or run adds one file here (ADR 0004). `pnpm changeset` writes it for you; agents write it directly:

```md
---
"@ziffr/web": minor
---

People can now sign in with an email link.
```

- `patch` fixes something, `minor` adds or changes something, `major` needs self-hosters to act (only from 1.0 on).
- Always name `@ziffr/web`: it stands for the product, including the core and the database.
- Write for the people who use or run Ziffr, in one or two plain sentences. Start notes for self-hosters with "Self-hosters:" and for developers with "Developers:".

The Release button turns these files into a section of `CHANGELOG.md` and removes them.
