# CLI JSON Output Contract

## `--json` flag behavior

Every `arcana` CLI command that produces tabular or human-readable output
must support `--json` (boolean flag). When `--json` is present:

1. **stdout** contains only valid JSON — no headers, no tables, no
   progress lines, no ANSI color codes, no pagination prompts.
2. **stderr** is reserved for logs, warnings, and errors (unchanged from
   human mode).
3. The JSON structure mirrors the data the command would display in
   table mode, serialized as plain objects/arrays.

Commands that already have a `--format json` option (e.g. `session list`,
`db query`, `replay`) are encouraged to also accept `--json` as a
shorthand. When both `--json` and `--format` are provided, `--json` wins.

## Exit code scheme

| Code | Meaning | When used |
|------|---------|-----------|
| `0` | Success | Command completed normally |
| `1` | User/validation error | Bad arguments, missing required fields, not found, permission denied |
| `2` | Internal error | Unexpected defect, unhandled exception, resource exhaustion |

Exit codes are set via `process.exitCode` (not `process.exit()`) so that
Effect runtime cleanup and `finally` disposers run normally.

## Shared helper

Module: `packages/engine/src/cli/json-output.ts`

Exports:
- `ExitCode` — frozen object with `SUCCESS`, `USER_ERROR`, `INTERNAL_ERROR`
- `outputJson(data)` — serializes `data` as pretty-printed JSON to stdout
- `isJsonMode(args)` — returns `true` when `args.json === true`
- `jsonOption(yargs)` — adds a `--json` boolean option to a yargs builder

## Commands converted in this mission

| Command | `--json` output shape |
|---------|----------------------|
| `arcana session list --json` | Array of session objects |
| `arcana node status --json` | Single node status object |
| `arcana trust list --json` | Array of trusted workspace objects |
| `arcana run --json` | Shorthand for `--format json` (line-delimited event objects); wins when both are given |
| `arcana serve --json` | `{ "status": "listening", "hostname", "port" }` emitted once the server binds (long-running) |
| `arcana history list --json` | Array of session objects |
| `arcana history show --json` | Single session detail object incl. last 10 messages |
| `arcana history resume --json` | `{ "command", "sessionId" }` |
| `arcana capability revoke --json` | `{ "revoked", "sessionID", "capabilityID", "reason", "revokedIds" }` |
| `arcana doctor --json` | Array of `{ label, ok, detail }` check objects |
| `arcana models --json` | Object keyed by provider ID; values are arrays of model objects |
| `arcana providers list --json` | `{ "credentials": [{ provider, name, type }], "environment": [{ provider, envVar }] }` — never includes keys/tokens |
| `arcana daemon status --json` | `{ "running", "daemons": [{ workspace, pid, port, startedAt, version }] }` |
| `arcana daemon stop --json` | `{ "stopping": [pid] }` / `{ "running": false }` |
| `arcana daemon start --json` | `{ "started": false, "message" }` |
| `arcana cron list --json` | Array of job objects |
| `arcana cron add/remove/pause/resume --json` | Job object / `{ "removed" }` / `{ "paused" }` / `{ "resumed" }` |
| `arcana cron run --json` | `{ "jobId", "success", "output", "error" }` |

Exemptions (documented per command in the BLK-CLI-02 PR body):

- `arcana gateway` (start/install) — long-running daemon / interactive package
  installer; no tabular result to serialize. Error paths still use exit codes
  0/1/2.
- `arcana cron start` / `arcana serve` completion — long-running processes with
  no completion result; `serve --json` emits a one-line startup acknowledgment,
  `cron start` rejects `--json` with exit 1.
- Approval CLI — no standalone approval command exists in the CLI surface
  (approvals are server HTTP routes + TUI cockpit surfaces), so there is
  nothing to convert.
- Legacy `packages/arcana` `run` handler — interactive REPL only, superseded by
  the engine `run` command which supports `--json`.

## Redaction rule

No secrets (tokens, keys, passwords) may appear in `--json` output.
Sensitive fields must be redacted or omitted.
