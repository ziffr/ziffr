---
"@ziffr/web": patch
---

Values sent by email, Slack, Telegram or the form link keep their decimal comma: `1,5` is now 1.5, not 1, and `1.234,56` is 1234.56. A typographic minus counts, and a number too long to be real is refused.
