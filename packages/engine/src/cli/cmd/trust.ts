import { cmd } from "./cmd"
import { effectCmd } from "../effect-cmd"
import { Effect } from "effect"
import { UI } from "../ui"
import {
  evaluateWorkspaceTrust,
  listTrustedWorkspaces,
  revokeWorkspaceTrust,
  trustWorkspace,
} from "@arcana/core/workspace/trust"
import path from "node:path"
import { outputJson, isJsonMode, jsonOption, ExitCode } from "../json-output"

const resolveTarget = (input?: string) => path.resolve(input?.trim() || process.cwd())

const TrustGrantCommand = effectCmd({
  command: "grant [path]",
  describe: false,
  instance: false,
  builder: (yargs) =>
    yargs.positional("path", {
      describe: "workspace path (default: cwd)",
      type: "string",
    }),
  handler: Effect.fn("Cli.trust.grant")(function* (args) {
    const target = resolveTarget(args.path as string | undefined)
    const decision = trustWorkspace(target)
    UI.println("")
    UI.println(UI.Style.TEXT_SUCCESS + "  trusted" + UI.Style.TEXT_NORMAL + "  " + decision.worktree)
    UI.println(UI.Style.TEXT_DIM + "  fingerprint  " + decision.fingerprint.slice(0, 16) + "…" + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "  Project plugins, agents, commands, tools, and local MCP may load." + UI.Style.TEXT_NORMAL)
    UI.println("")
  }),
})

const TrustStatusCommand = effectCmd({
  command: "status [path]",
  describe: false,
  instance: false,
  builder: (yargs) =>
    yargs.positional("path", {
      describe: "workspace path (default: cwd)",
      type: "string",
    }),
  handler: Effect.fn("Cli.trust.status")(function* (args) {
    const target = resolveTarget(args.path as string | undefined)
    const decision = evaluateWorkspaceTrust(target)
    UI.println("")
    UI.println(`  path         ${decision.worktree}`)
    UI.println(`  status       ${decision.status}`)
    UI.println(`  executable   ${decision.allowsExecutable ? "allowed" : "blocked"}`)
    UI.println(`  reason       ${decision.reason}`)
    UI.println(`  fingerprint  ${decision.fingerprint.slice(0, 16)}…`)
    UI.println("")
  }),
})

const TrustRevokeCommand = effectCmd({
  command: "revoke [path]",
  describe: false,
  instance: false,
  builder: (yargs) =>
    yargs.positional("path", {
      describe: "workspace path (default: cwd)",
      type: "string",
    }),
  handler: Effect.fn("Cli.trust.revoke")(function* (args) {
    const target = resolveTarget(args.path as string | undefined)
    const ok = revokeWorkspaceTrust(target)
    UI.println("")
    if (ok) {
      UI.println(UI.Style.TEXT_WARNING + "  revoked" + UI.Style.TEXT_NORMAL + "  " + path.resolve(target))
    } else {
      UI.println(UI.Style.TEXT_DIM + "  not trusted  " + path.resolve(target) + UI.Style.TEXT_NORMAL)
    }
    UI.println("")
  }),
})

const TrustListCommand = effectCmd({
  command: "list",
  describe: false,
  instance: false,
  builder: (yargs) => yargs.option("json", {
    describe: "output machine-readable JSON to stdout",
    type: "boolean",
    default: false,
  }),
  handler: Effect.fn("Cli.trust.list")(function* (args) {
    const rows = listTrustedWorkspaces()
    if (isJsonMode(args)) {
      outputJson(rows.map((row) => ({ worktree: row.worktree, trustedAt: row.trustedAt, fingerprint: row.fingerprint })))
      return
    }
    UI.println("")
    if (rows.length === 0) {
      UI.println(UI.Style.TEXT_DIM + "  no trusted workspaces" + UI.Style.TEXT_NORMAL)
    } else {
      for (const row of rows) {
        UI.println(`  ${row.worktree}`)
        UI.println(UI.Style.TEXT_DIM + `    ${row.trustedAt}  ${row.fingerprint.slice(0, 12)}…` + UI.Style.TEXT_NORMAL)
      }
    }
    UI.println("")
  }),
})

/** Default `arcana trust` grants trust for cwd (most common). */
const TrustDefaultCommand = effectCmd({
  command: "$0",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.trust.default")(function* () {
    const decision = trustWorkspace(process.cwd())
    UI.println("")
    UI.println(UI.Style.TEXT_SUCCESS + "  trusted" + UI.Style.TEXT_NORMAL + "  " + decision.worktree)
    UI.println(UI.Style.TEXT_DIM + "  Run `arcana trust status` to inspect. `arcana trust revoke` to undo." + UI.Style.TEXT_NORMAL)
    UI.println("")
  }),
})

export const TrustCommand = cmd({
  command: "trust",
  describe: "trust a workspace to load project plugins, tools, agents, and local MCP",
  builder: (yargs) =>
    yargs
      .command(TrustDefaultCommand)
      .command({ ...TrustGrantCommand, describe: "trust a workspace path" })
      .command({ ...TrustStatusCommand, describe: "show trust status for a path" })
      .command({ ...TrustRevokeCommand, describe: "revoke trust for a path" })
      .command({ ...TrustListCommand, describe: "list trusted workspaces" }),
  async handler() {},
})
