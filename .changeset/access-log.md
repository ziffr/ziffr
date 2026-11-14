---
"@ziffr/web": minor
---

The API now limits each Access Key to about 60 calls a minute; a program that goes over gets a 429 answer with `Retry-After` and gets in again after waiting. Every call with a key goes into its Access Log (when, which endpoint, the result; never the data sent), shown under the key on the Team page and kept for 90 days. Owners and Admins see every key and its log, everyone else their own; only Owners and a key's creator can revoke it. Self-hosters: run the new migration.
