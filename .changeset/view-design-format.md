---
"@ziffr/web": minor
---

Views can now be written as files: the View Design format, `ziffr.view/1`, with its JSON Schema in `docs/reference/view-design.schema.json`. A design holds no code, and Ziffr refuses any file with web addresses, markup, unknown fields or more than it allows, naming each problem with its line.
