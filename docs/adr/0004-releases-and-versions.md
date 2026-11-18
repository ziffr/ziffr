# One product version, a release note with every change, notes taken from the changelog

Ziffr has one version number for the product (the app, the core and the database migrations together), following semantic versioning: `0.x` until the first public release, then a major version for anything a self-hoster must act on (a breaking API or MCP change, a manual step). The MIT packages others build on (connector kit, client libraries) get their own versions once they are published, because people depend on them separately. Every pull request that changes what people use or run carries its release note as a Changeset, a small file that names the kind of change and says in one or two sentences what changes for people; CI refuses a pull request without one unless a maintainer labels it `no-release-note`. A release turns the waiting notes into a new section of `CHANGELOG.md`, sets the version, tags it `vX.Y.Z`, and the GitHub release is made from that very section, so the release notes and the changelog cannot differ. Each release also states the day it becomes AGPL-3.0, because under the BSL that date runs separately for every published version.

## Considered Options

- **Editing `CHANGELOG.md` directly in every pull request**: rejected; parallel pull requests collide on the same lines, and nothing knows whether a change is a fix or a breaking one.
- **Release notes written from commit messages** (Conventional Commits, release-please): rejected; our commit messages explain why for developers, while release notes say what changes for people who use or run Ziffr. One text cannot do both well.
- **A version per package**: rejected for the app and core; nobody installs them separately, and self-hosters need one number to report and upgrade by.

## Consequences

- Contributors and agents add a file under `.changeset/` with every user-visible change; `pnpm changeset` writes it for people, agents write it directly.
- Before `1.0` a breaking change is a minor bump; the release script refuses a major bump until the first public release is decided.
- Notes for self-hosters (migrations, new environment variables, manual steps) start with "Self-hosters:" and are shown first in every release.

## Amendment, 2026-11-18: releases go in by pull request

`main` is protected: it takes changes only through pull requests whose required checks pass (`check`, `core-db`, `numbers`), with no exception for administrators. The agents act with a maintainer's GitHub account, so an exception for maintainers would be one for them too. `pnpm release` therefore commits the release on a branch `release/vX.Y.Z` instead of `main`, opens its pull request, waits for the checks, merges it, tags the merged commit after checking that it is that release, and pushes the tag, which makes the GitHub release as before. It asks before it starts, and the release run still waits for a maintainer's approval. The release notes and the changelog still come from the same section.
