---
"@ziffr/web": minor
---

Owners and Admins can find, install and update free Packs from the Marketplace on the Packs page, once an Installation Admin turns the connection on (Installation settings, Marketplace). Self-hosters: `ZIFFR_MARKETPLACE` is off unless set to `on`; the server, never a browser, connects to `ZIFFR_MARKETPLACE_URL` (Ziffr's own unless set, https only), checks each Pack's Ed25519 signature, and sends no Workspace's or person's data.
