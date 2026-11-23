---
"@ziffr/web": patch
---

Self-hosters: the demo now keeps its own state (a Generation counter that moves at each reset), and the reset job can skip a demo nobody changed; nothing changes for visitors or for the nightly reset.
