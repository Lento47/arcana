# Configuration

Arcana is configured through `~/.arcana/config.json`. Most settings have sensible defaults and can be overridden with environment variables.

## Config file location

```sh
~/.arcana/config.json
```

Override with `ARCANA_HOME`:

```sh
export ARCANA_HOME=/custom/path
# Config loaded from /custom/path/config.json
```

## Full config reference

```json
{
  "$schema": "https://arcana.otnelhq.com/schema/config.json",
  "provider": "openai",
  "model": "gpt-4o",
  "utilityModel": "gpt-4o-mini",
  "apiKey": "sk-...",
  "dataDir": "~/.arcana/data",
  "skillsDirs": ["~/.arcana/skills"],
  "memory": {
    "enabled": true,
    "maxSessions": 1000
  },
  "cron": {
    "enabled": true,
    "intervalSeconds": 60
  },
  "gateway": {
    "telegram": { "token": "...", "allowedUsers": ["12345678"] },
    "discord": { "token": "...", "allowedChannels": ["987654321"] },
    "slack": { "botToken": "xoxb-...", "signingSecret": "...", "allowedChannels": ["C0123"] },
    "whatsapp": { "phoneNumberId": "...", "accessToken": "...", "appSecret": "...", "allowedUsers": ["14155551234"] }
  }
}
```

## Core settings

| Key | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | auto-detected | LLM provider (`openai`, `anthropic`, `gemini`, etc.) |
| `model` | `string` | auto-detected | Model ID (`gpt-4o`, `claude-sonnet-4`, etc.) |
| `utilityModel` | `string` | main model | Cheap model for extraction and compaction tasks |
| `apiKey` | `string` | — | Provider API key (prefer env vars instead) |
| `dataDir` | `string` | `~/.arcana/data` | Directory for sessions, memory, and local DB |

### Provider auto-detection

If neither `provider` nor `model` is set in the config or environment, Arcana auto-detects from available API keys using the models.dev catalog (200+ models across 33 providers).

```sh
# Set a provider key — Arcana detects it automatically
export OPENAI_API_KEY=sk-...
arcana run "hello"  # Uses OpenAI automatically
```

## Memory settings

| Key | Type | Default | Description |
|---|---|---|---|
| `memory.enabled` | `boolean` | `true` | Enable conversation memory and fact extraction |
| `memory.maxSessions` | `number` | `1000` | Maximum sessions to retain in local DB |

Memory stores conversation history, extracted facts, and skill usage stats in SQLite under `~/.arcana/data/`.

## Session compaction

Long sessions auto-summarize near the context limit (default **85%**). Full reference: [session-compaction.md](./session-compaction.md).

| Key | Type | Default | Description |
|---|---|---|---|
| `compaction.auto` | `boolean` | `true` | Enable automatic compaction |
| `compaction.threshold_percent` | `number` | `85` | Trigger when usage reaches this % of context (1–100) |
| `compaction.reserved` | `number` | ~output / 20k | Token reserve for model output (hard ceiling) |
| `compaction.tail_turns` | `number` | `2` | Recent user turns kept verbatim |
| `compaction.preserve_recent_tokens` | `number` | ~2k–8k | Max tokens kept in the verbatim tail |
| `compaction.prune` | `boolean` | `false` | Background-prune old tool outputs |
| `compaction.intra` | `boolean` | `true` | Mid-loop compact during multi-step tool runs |
| `compaction.intra_min_steps` | `number` | `3` | Min agent loop steps before intra compact |
| `compaction.intra_min_tokens` | `number` | `5000` | Min usage before intra compact is worth it |

```jsonc
{
  "compaction": {
    "auto": true,
    "threshold_percent": 85,
    "intra": true
  }
}
```

Set `"intra": false` to only compact between user turns. Set `"auto": false` to disable all auto compact (manual `/compact` still works).

## Cron settings

| Key | Type | Default | Description |
|---|---|---|---|
| `cron.enabled` | `boolean` | `true` | Enable the cron scheduler |
| `cron.intervalSeconds` | `number` | `60` | How often the scheduler checks for due jobs |

## Skills settings

| Key | Type | Default | Description |
|---|---|---|---|
| `skillsDirs` | `string[]` | `["~/.arcana/skills", "<repo>/skills"]` | Directories to scan for SKILL.md files |

## Gateway settings

Configure chat platform adapters. See [Gateway](/docs/gateway) for full setup instructions.

| Key | Type | Description |
|---|---|---|
| `gateway.telegram.token` | `string` | Telegram bot token |
| `gateway.telegram.allowedUsers` | `string[]` | Allowed Telegram user IDs |
| `gateway.discord.token` | `string` | Discord bot token |
| `gateway.discord.allowedChannels` | `string[]` | Allowed Discord channel IDs |
| `gateway.slack.botToken` | `string` | Slack bot token (`xoxb-...`) |
| `gateway.slack.signingSecret` | `string` | Slack signing secret |
| `gateway.slack.allowedChannels` | `string[]` | Allowed Slack channel IDs |
| `gateway.whatsapp.phoneNumberId` | `string` | Meta phone number ID |
| `gateway.whatsapp.accessToken` | `string` | Meta access token |
| `gateway.whatsapp.appSecret` | `string` | Meta app secret (required for production) |
| `gateway.whatsapp.allowedUsers` | `string[]` | Allowed phone numbers (with country code) |

## Environment variables

All config file settings can be overridden with environment variables:

| Env var | Overrides | Description |
|---|---|---|
| `ARCANA_HOME` | config path | Root directory (default: `~/.arcana`) |
| `ARCANA_PROVIDER` | `provider` | LLM provider |
| `ARCANA_MODEL` | `model` | Model ID |
| `ARCANA_API_KEY` | `apiKey` | Provider API key |
| `OPENAI_API_KEY` | `apiKey` | Fallback when provider is `openai` |
| `ARCANA_SKILLS_DIRS` | `skillsDirs` | Skill directories (separated by `;`) |
| `ARCANA_PROXY_KEY` | — | Proxy license key (auto-loaded from `~/.arcana/proxy_key`) |

### Provider-specific env vars

| Env var | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `GEMINI_API_KEY` | Google Gemini |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Amazon Bedrock |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI |
| `XAI_API_KEY` | xAI (Grok) |

Use `arcana doctor` to confirm which keys are detected.

## Data directory

Default: `~/.arcana/data/`

| Path | Contents |
|---|---|
| `sessions/` | Session transcripts |
| `memory.db` | SQLite DB with facts, skill stats |
| `cron-jobs.json` | Scheduled job definitions |
| `workspace-trust.json` | Trusted workspace fingerprints |

Override with `dataDir` in config or let Arcana use the default.

## Trust and security settings

| Setting | Location | Description |
|---|---|---|
| `arcana trust` | CLI command | Trust current workspace for project plugins/tools |
| `ARCANA_DISABLE_WORKSPACE_TRUST=1` | Env var | Skip trust checks (dev only) |
| `ARCANA_TRUST_WORKSPACE=1` | Env var | Force-trust for CI |
| `ARCANA_SERVER_PASSWORD` | Env var | Required for non-loopback `arcana serve` |
| `ARCANA_GATEWAY_OPEN=1` | Env var | Allow empty gateway allowlists (dev only) |
