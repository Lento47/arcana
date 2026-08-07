// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
//
// Legacy `arcana` CLI copy of the engine's shared --json output helper
// (packages/engine/src/cli/json-output.ts). Kept in sync so legacy
// subcommand handlers implement the same JSON contract and exit-code scheme.

import type { Argv } from "yargs"

/** Deterministic exit codes for the arcana CLI. */
export const ExitCode = {
  SUCCESS: 0,
  USER_ERROR: 1,
  INTERNAL_ERROR: 2,
} as const

/**
 * Serialize data as pretty-printed JSON and write to stdout.
 * Suppresses all other output when --json mode is active.
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Check whether the --json flag is present in parsed yargs arguments.
 */
export function isJsonMode(args: { json?: boolean }): boolean {
  return args.json === true
}

/**
 * Build a --json boolean option for yargs builders while preserving the
 * command-specific argument type accumulated by earlier builder calls.
 */
export function jsonOption<T extends object>(yargs: Argv<T>) {
  return yargs.option("json", {
    describe: "output machine-readable JSON to stdout",
    type: "boolean",
    default: false,
  })
}
