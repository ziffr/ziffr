# @ziffr/figures

How Ziffr writes a number and a period, in one place: the app, the MCP views and the emails all use it, so a value reads the same everywhere.

- `writeNumber(value, decimals, style, options)`: a value in one of the four Number Styles (`"1,234.5"`, `"1.234,5"`, `"1 234,5"`, `"1'234.5"`) with the "−" minus, an optional unit on its side, a short suffix (`k`, `M`) or the sign of a change (`+12.0 %`).
- `writePeriod(start, span, yearStart, short)`: a period named from its first day, such as "October 2026", "Q3 26" or "FY 2026/27", following the Fiscal Year's first month.

Both are plain functions with no outside references, so a page can embed their source (`fn.toString()`), as the MCP views do. Intl is the only thing they use.

MIT licensed.
