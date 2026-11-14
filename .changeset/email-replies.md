---
"@ziffr/web": minor
---

Replies by email come back into Ziffr: answering a Prompt with the number records it (a Breakdown too, one row per line), and answering a question or task puts the reply in its Thread, where a "Correction: 1234" line proposes a Correction. Quoted text and signatures are left out, and the person is told what became of their number. Only the person the email went to can answer it. Self-hosters: run the new migration, set `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET` and, so senders are checked, `ZIFFR_INBOUND_AUTHSERV_ID` (without it, Approvals are not taken by email), and have your mail provider forward replies to `POST /api/inbound/email`, signed (the self-hosting guide follows).
