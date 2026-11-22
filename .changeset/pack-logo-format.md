---
"@ziffr/web": minor
---

Developers: a Pack file may carry one `logo`, and a Theme of the Pack may say `"logo": "pack"`. `npx @ziffr/pack check` checks the logo with the same code Ziffr runs for Theme logos, and names the line of any problem. Those checks are now stricter: an SVG with entities, a stylesheet instruction, a mislabelled picture or an unquoted link is refused. Installing and showing the logo come in the next releases.
