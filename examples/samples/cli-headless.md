# Sample: headless CLI walkthrough

Every command below is a real `arcana` CLI command (command spine in
`packages/engine/src/index.ts`, implementations in `packages/engine/src/cli/cmd/`).

## 1. Diagnostics

```bash
arcana --version
arcana doctor          # environment / install health checks
arcana config show     # print effective config (file + env overrides)
arcana config show --key server
arcana config init     # write a starter config
```

## 2. Run an agent

```bash
# one-shot (non-interactive)
arcana run "explain the .gitignore in three bullets"

# structured output (JSON)
arcana run "return the file count as JSON" --format json

# pick a model and an agent profile
arcana run "refactor parse.ts" --model <provider>/<model> --agent primary

# continue an existing session
arcana run "and now the test counts" --session <session-id> --continue

# interactive REPL attached to a session
arcana run --session <session-id> --interactive --attach

# diagnostic logging
arcana run "quick check" --print-logs --log-level DEBUG
```

Flags are defined in `packages/engine/src/cli/cmd/run.ts` (`--interactive`,
`--attach`, `--command`, `--format json`, `--continue`, `--session`, `--fork`).

## 3. Serve (HTTP API for the SDK)

```bash
# loopback only (default 127.0.0.1, ephemeral port)
arcana serve

# fixed port
arcana serve --hostname 127.0.0.1 --port 4096

# mDNS discovery / CORS
arcana serve --mdns --cors
```

Network options are defined in `packages/engine/src/cli/cmd/serve.ts`. Binding to a
non-loopback address requires `ARCANA_SERVER_PASSWORD` (see `docs/SECURITY-CHECKLIST.md`).

## 4. Agents

```bash
arcana agent create \
  --description "Refactor-focused engineer" \
  --mode primary \
  --permissions "read,edit,bash" \
  --path agents
arcana agent list
```

`--permissions` accepts a comma-separated subset of: `bash, read, edit, glob, grep,
webfetch, task, todowrite, websearch, lsp, skill` (see `agent.ts`).

## 5. Proofs and governance

```bash
arcana epistemic proof inspect <session-id>
arcana epistemic proof verify <session-id>
arcana epistemic proof export <session-id> --format json
arcana epistemic proof export <session-id> --format markdown
arcana epistemic claims <session-id>
arcana capability revoke <session-id> <capability-id>
```

## 6. Daemon

```bash
arcana daemon start
arcana daemon status
arcana daemon stop
```

## 7. Launch other runtimes

```bash
arcana launch codex --dry-run
arcana launch claude --directory .
arcana launch gemini
```
