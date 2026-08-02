# Gateway (chat bots)

Arcana can act as an AI assistant inside Telegram, Discord, Slack, and WhatsApp. Each platform runs as a separate adapter; you can enable one or all simultaneously.

```sh
arcana gateway
```

## Configuration

Add a `gateway` block to `~/.arcana/config.json`:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "gateway": {
    "telegram": { "token": "111:xxx", "allowedUsers": ["12345678"] },
    "discord": { "token": "xxx", "allowedChannels": ["987654321"] },
    "slack": { "botToken": "xoxb-xxx", "signingSecret": "xxx", "allowedChannels": ["C0123ABC"] },
    "whatsapp": { "phoneNumberId": "123456", "accessToken": "xxx", "appSecret": "xxx", "allowedUsers": ["14155551234"] }
  }
}
```

You can also pass tokens directly:

```sh
arcana gateway --telegram-token "111:xxx"
arcana gateway --discord-token "xxx"
```

## Platform setup

### Telegram

1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot.
2. Copy the bot token into your config.
3. Add your Telegram user ID to `allowedUsers`. To find your numeric user ID, forward a message from your bot to [@userinfobot](https://t.me/userinfobot), or call `https://api.telegram.org/bot<TOKEN>/getUpdates` and look for `from.id`.

### Discord

1. Create a new application at [discord.com/developers](https://discord.com/developers/applications).
2. Go to **Bot** → copy the bot token.
3. Enable **Message Content Intent** under Privileged Gateway Intents.
4. Invite the bot to your server with the `bot` scope and `Send Messages` + `Read Message History` permissions.
5. Add the channel ID to `allowedChannels`.

**Note:** Discord replies are capped at 2000 characters. Longer responses are split into multiple messages; chunks carry a `…[continued]` tail and the final chunk reports the omitted character count (honest-tail marker, never silent truncation).

### Slack

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add the `chat:write`, `channels:history`, and `im:history` scopes.
3. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`).
4. Under **Basic Information**, copy the **Signing Secret**.
5. Under **Event Subscriptions**, enable events and request the `message.channels` and `message.im` bot events.
6. Add the channel ID to `allowedChannels`.

**Note:** Check [Slack's API docs](https://api.slack.com/authentication) for the latest required scopes, as they may change.

### WhatsApp

WhatsApp uses the Meta Cloud API via webhooks. You need a Meta Business App with the WhatsApp product added.

1. Create a Meta Business App at [developers.facebook.com](https://developers.facebook.com).
2. Add the WhatsApp product to your app.
3. Copy the **Phone Number ID** and **Access Token** (temporary or permanent) into your config.
4. Set `appSecret` for webhook signature verification (required for production).
5. Expose your local webhook server (port 3100 by default) with a tool like `ngrok`:

```sh
ngrok http 3100
```

6. In the Meta dashboard, configure the webhook URL as `https://your-domain/webhook` and subscribe to `messages` events.
7. Set `verifyToken` to match what you configure in the Meta dashboard (or it defaults to a random UUID).

**Note:** WhatsApp messages are capped at 4096 characters. Longer responses are split into multiple messages; chunks carry a `…[continued]` tail and the final chunk reports the omitted character count (honest-tail marker, never silent truncation).

## Security

### Allowlists (required)

Every platform requires an allowlist. The gateway refuses to start with an empty or missing allowlist unless `ARCANA_GATEWAY_OPEN=1` is set (local dev only).

| Platform | Allowlist field | What to put |
|---|---|---|
| Telegram | `allowedUsers` | Telegram user IDs (numeric) |
| Discord | `allowedChannels` | Discord channel IDs |
| Slack | `allowedChannels` | Slack channel IDs (`C0...`) |
| WhatsApp | `allowedUsers` | Phone numbers with country code, no `+` |

### WhatsApp webhook signatures

The WhatsApp adapter verifies `x-hub-signature-256` on every incoming webhook request using your `appSecret`. This is **required** in production. Set `ARCANA_WHATSAPP_INSECURE=1` only for local development.

### Dev escape hatches

| Env / CLI | Effect |
|---|---|
| `ARCANA_GATEWAY_OPEN=1` | Allow empty platform allowlists (local dev only). |
| `ARCANA_WHATSAPP_INSECURE=1` | Skip WhatsApp webhook signature verification (dev only). |
| `WHATSAPP_WEBHOOK_PORT` | Override the WhatsApp webhook listen port (default: `3100`). |

## How it works

- Each chat platform gets its own adapter that translates messages to and from Arcana.
- Every chat ID gets its own agent session with conversation history and memory integration — the bot remembers context within each chat.
- Destructive shell commands are blocked by default for safety.
- The agent has a capped tool-call budget per turn to prevent runaway executions.
- Provider keys and model selection come from your main `~/.arcana/config.json`.

## License requirement

The gateway requires a **Pro** or **Enterprise** license. Set `ARCANA_LICENSE_KEY` or complete `arcana console login` before starting the gateway.
