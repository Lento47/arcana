# Browser Automation in Arcana

Arcana agents drive a real Chrome browser using [agent-browser](https://agent-browser.dev) via MCP.

## Setup

### 1. Install agent-browser

```bash
npm install -g agent-browser
agent-browser install
```

### 2. Configure the MCP server

Add to `~/.config/arcana/arcana.json`:

```json
{
  "mcp": {
    "browser": {
      "type": "local",
      "command": ["agent-browser", "mcp", "--tools", "core"],
      "environment": {
        "AGENT_BROWSER_CONTENT_BOUNDARIES": "1",
        "AGENT_BROWSER_MAX_OUTPUT": "50000",
        "AGENT_BROWSER_IDLE_TIMEOUT_MS": "3600000"
      }
    }
  }
}
```

### 3. Verify

```bash
arcana run "list your browser tools" 2>&1 | grep MCP
# → MCP: browser (29 tools)
```

## Usage

```bash
# With the browser skill loaded
arcana run --skill browser-automation "log into app.example.com and check notifications"

# Without — the agent still sees the tools
arcana run "open github.com, find the top trending repo"
```

## Tool Profiles

| Profile | Tools | Use |
|---|---|---|
| `core` | 29 | Default |
| `core,network,tabs` | ~45 | Web app testing |
| `all` | ~100 | Power users |

Change `--tools core` in config to switch profiles.

## Security

- `AGENT_BROWSER_ALLOWED_DOMAINS` — restrict navigation (env var or per-tool arg)
- `AGENT_BROWSER_CONFIRM_ACTIONS` — gate eval/download
- `AGENT_BROWSER_ENCRYPTION_KEY` — encrypt persisted sessions

## Troubleshooting

| Problem | Fix |
|---|---|
| "MCP: (no servers)" | Check `arcana.json` for `mcp.browser` |
| "Failed to connect" | `agent-browser doctor` |
| Tools not responding | Restart Arcana session |
| Too many tools | Use `--tools core` |
