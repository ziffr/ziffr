---
"@ziffr/web": patch
---

Self-hosters: a Docker install without a domain sends sign-in links again (its default sender address now has a dot in its domain, which Ziffr requires since it sends sign-in links itself).
