---
"@ziffr/web": minor
---

Developers: a release is now a tag on `main`: the Release button tags main's tested commit, builds the image with that version and publishes the GitHub release, whose notes replace `CHANGELOG.md` from 0.12.0 on, and the npm packages, which now carry the product's version. No release pull request, no second CI run.
