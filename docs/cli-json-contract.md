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

## Redaction rule

No secrets (tokens, keys, passwords) may appear in `--json` output.
Sensitive fields must be redacted or omitted.
