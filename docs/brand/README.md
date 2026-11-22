# Ziffr brand files

The Ziffr mark and the pictures to upload when you set up the chat apps for your own Ziffr. They are generated from [`apps/web/public/icons/icon.svg`](../../apps/web/public/icons/icon.svg) by `node scripts/app-icons.mjs` and kept in [`apps/web/public/brand/`](../../apps/web/public/brand/), so a running Ziffr also serves them at `/brand/<file>` (the Installation settings page links them from there). Never edit the pictures by hand: change the source and run the script.

| File | Size | Use it for |
| --- | --- | --- |
| [`ziffr-logo.svg`](../../apps/web/public/brand/ziffr-logo.svg) | vector | The mark with rounded corners, wherever a vector fits. |
| [`ziffr-logo.png`](../../apps/web/public/brand/ziffr-logo.png) | 1024 × 1024 | The same mark as a picture. |
| [`ziffr-telegram-bot.png`](../../apps/web/public/brand/ziffr-telegram-bot.png) | 640 × 640 | The bot's picture: in @BotFather send `/setuserpic`, choose the bot, send this file. Telegram crops it to a circle; the mark sits well inside it. |
| [`ziffr-slack-app.png`](../../apps/web/public/brand/ziffr-slack-app.png) | 1024 × 1024 | The Slack app's icon: on the app's Basic Information page, under Display Information. Slack asks for a square between 512 and 2000 pixels and rounds the corners itself. |

The colours are Ziffr's own (the Coral design tokens: board `#1f1917`, paper `#f8f4f1`, accent `#ef8b7b`). Messages to a Workspace's Slack carry that Workspace's own name and logo instead (see the [Slack guide](../guides/slack.md)); Telegram has one bot and one picture for every Workspace.
