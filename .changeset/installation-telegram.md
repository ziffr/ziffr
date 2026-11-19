---
"@ziffr/web": minor
---

Self-hosters: an Installation Admin can now set the Telegram bot on the Installation settings page. Ziffr checks the token with Telegram, shows the bot's name and tells Telegram where to send answers, without a restart. **Remove** tells Telegram to stop. `ZIFFR_TELEGRAM_BOT_TOKEN` in the environment still wins.
