# GitHub Feed: counting downloads of Ziffr itself

Ziffr counts its own downloads in a Workspace on app.ziffr.net (ticket #436, part of the dogfood in [spec 0031](../specs/0031-usage-and-dogfood.md)). The **GitHub Feed** (`packages/feed-github`, MIT like the other packages for programs) is a [Feed](feeds.md) that reads this repository's public numbers from GitHub and sends them once a day. It collects nothing about people and needs no secret for GitHub.

## What the numbers are

**These are requests counted by GitHub, not running Installations.** Every download of `compose.yml` or `install.sh` counts, including bots, mirrors, scanners and retries, and nobody who fetched a file is known to have started anything. Read them as interest and as a rough trend, never as a count of Installations. Installations are seen through the Usage Feed, see [Usage](usage.md).

Every Metric has a daily period, and its value is the cumulative count as of that day. A day's downloads are the difference between two days. GitHub keeps no history of these counts, so the Feed cannot fill days it did not run: a missed day stays empty, and starting late does not backfill.

| Metric slug | Value | Breakdown |
| --- | --- | --- |
| `github-downloads-compose-yml` | downloads of `compose.yml`, all releases | per release (tag) |
| `github-downloads-install-sh` | downloads of `install.sh`, all releases | per release (tag) |
| `github-stars` | stars of the repository | none |
| `github-forks` | forks of the repository | none |

Draft releases are left out. Other release assets are not counted.

## Image pulls are not included

Pulls of the image `ghcr.io/ziffr/ziffr` are not here. GitHub's API shows a package's pull count only to someone signed in with access to it, never publicly, so no Feed without a secret can read it. The number appears on the package's page on GitHub for people who maintain it.

## Set it up, once (the owner)

1. In the Workspace that should hold the numbers, open Settings, Feeds, create a Feed named "GitHub" and a Feed Key for it. Copy the key; it is shown once.
2. Create the four Metrics above with the period day, the slugs as listed, and the Feed as Submitter, with its API Source on. Do not set a Due Date for the Feed's Submission.
3. Add the Feed Key to this repository as the Actions secret `ZIFFR_DOGFOOD_FEED_KEY` (Settings, Secrets and variables, Actions).

The workflow `.github/workflows/dogfood-downloads.yml` runs daily at 05:23 UTC and can be started by hand. While the secret is missing it says so and succeeds. It has `contents: read` only and sends to https://app.ziffr.net.

## Running it elsewhere

```sh skip="needs a Feed Key and reaches GitHub"
ZIFFR_GITHUB_FEED_KEY=zk_... ZIFFR_GITHUB_FEED_URL=https://ziffr.example.com ziffr-feed-github run --dry-run
```

`ZIFFR_GITHUB_REPO` names another repository (default `ziffr/ziffr`). `GITHUB_TOKEN` is optional and only lifts GitHub's rate limit of 60 calls an hour without one; a run makes two or three calls. The command exits with 1 when GitHub could not be read or Ziffr refused a value. Like every Feed it keeps no state and is safe to repeat.
