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

## Amendment, 2026-11-18: the Release button

Releasing from the maintainer's computer took one command but many steps, and a stale local tag or a failed check left a release half done. A release is now one run of the workflow **Release** (`.github/workflows/release.yml`), started with **Actions → Release → Run workflow** on `main` or with `pnpm release`, which starts the same run. The run makes the release commit, opens its pull request, starts CI on it, merges it once the required checks pass, tags it, and publishes the GitHub release and the image. Pressing the button is the approval: only the repository's owner may start it, so the run no longer waits in the environment `release` (package publishing still does). Anything done with the workflow's own token starts no runs of its own, so the run starts CI on the release branch by name and does the release itself instead of reacting to its tag; for that, GitHub Actions may open pull requests in this repository, and the ruleset on `v*` and `*-v*` tags no longer limits who creates them, only that none is moved or deleted (a repository owned by a person cannot name GitHub Actions as an exception). A tag starts nothing any more: only the button releases, and package tags still wait for approval in `release`. The full mutation run is left out of a release when no calculation path changed since the last nightly run that reached the score. The agents act with the owner's account, so what keeps them from releasing is the rule in `AGENTS.md`, as it was with the approval.


## Superseded in part, 2026-11-19: a release is a tag on main

How a release is made is now ADR 0014: the Release button tags `main`'s current commit, the version comes from the tag, the notes are the Changesets added since the previous tag and appear on the GitHub Releases page, and nothing is committed. The two amendments above, and "a release turns the waiting notes into a new section of `CHANGELOG.md`", no longer apply; `CHANGELOG.md` keeps its sections up to 0.11.0. The MIT packages carry the product's version from 0.12.0 on. One product version, a release note with every change and the rule about major versions before 1.0 stay as decided here.
