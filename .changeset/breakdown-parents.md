---
"@ziffr/web": minor
---

A row of a Breakdown can now be a part of another row of the same Breakdown, such as a city of a country: paste a third column with the name of the row it belongs to, send `parent` through the API, a Feed or the MCP Server, or put it in a Workspace Export file. A Breakdown may go 4 levels down and hold 200 rows; a list with a cycle, a row that is its own parent, a parent that is no row of the list or a name used twice is refused in words and nothing is recorded. View Designs can draw such a Breakdown as a tree (the `tree` mark with `show` as `breakdown`): every box is the row's own number, a row whose parts add up to another number says both, a negative row is hatched, and the smallest rows past 24 boxes are grouped as Other rows that the text version still names. Charts that read a Breakdown as a flat list keep reading the rows at the top, so no row is counted twice.

Developers: reading a Metric's values through the API now lists a part after its row with `parent`; add up only the rows without `parent`.

Developers: under a Metric's rule that adds values up, a program that sends flat rows into a Breakdown that already has parts is refused until it sends the parents too. A parent column in a pasted table needs a **Parent** header, and is never read from a mail, Slack or Telegram message.
