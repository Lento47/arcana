/**
 * Phase C Task 6: PEP integration adapter
 *
 * Bridges the abstract PEP to concrete tool execution.
 * Constructs AuthorizationRequests from tool call parameters
 * and routes through authorizeAndExecute.
 */

import { authorizeAndExecute } from "./pep"
import type { PreparedEffect, PolicyContextProvider, EnforcementResult } from "./pep"
import type { AuthorizationRequest, CapabilityAction, ProvenanceLabel, SensitivityLabel, CanonicalResource } from "./types"
import type { PolicyContext } from "./pdp"
import { randomUUID } from "node:crypto"

// ─── Tool Effect Mapping ──────────────────────────────────────────────

/**
 * Maps a tool name to its capability action and resource kind.
 * This is the canonical mapping from the security-boundary audit.
 */
export function toolToAction(toolName: string): {
  action: CapabilityAction
  resourceKind: CanonicalResource["kind"]
} {
  // Map both production tool IDs (shell, read, write, …) and legacy/audit names
  // (terminal, read_file, …) so PDP resource matching stays consistent.
  switch (toolName) {
    case "shell":
    case "bash":
    case "terminal":
    case "cronjob":
    case "env_install":
      return { action: "process.execute", resourceKind: "process" }
    case "write":
    case "write_file":
    case "edit":
    case "patch":
    case "env_write":
    case "skill_create":
    case "skill":
      return { action: "filesystem.write", resourceKind: "file" }
    case "read":
    case "read_file":
    case "glob":
    case "grep":
    case "search_files":
    case "lsp":
    case "todo":
    case "goal_set":
    case "goal_check":
    case "plan":
    case "question":
      return { action: "filesystem.read", resourceKind: "file" }
    case "send_message":
    case "image_generate":
    case "speak":
      return { action: "network.write", resourceKind: "network" }
    case "task":
    case "delegate_task":
    case "workflow":
      return { action: "delegate", resourceKind: "process" }
    case "websearch":
    case "web_search":
    case "webfetch":
    case "web_fetch":
    case "fetch":
    case "search":
    case "mcp":
      return { action: "network.write", resourceKind: "network" }
    case "env_clean":
      return { action: "filesystem.delete", resourceKind: "file" }
    case "git_commit":
    case "git_autocommit":
      return { action: "git.commit", resourceKind: "git" }
    case "git_push":
      return { action: "git.push", resourceKind: "git" }
    default:
      // Unknown tools default to the most restrictive action
      return { action: "process.execute", resourceKind: "process" }
  }
}

// ─── Authorization Request Builder ────────────────────────────────────

export interface ToolCallContext {
  toolName: string
  principalId: string
  sessionId: string
  contractId?: string
  contractRevision?: string
  criterionIds?: string[]
  workspaceId?: string
  args: Record<string, unknown>
  executable?: string
  arguments?: string[]
  workingDirectory?: string
  networkDestination?: string
  provenance?: ProvenanceLabel[]
  sensitivity?: SensitivityLabel[]
}

/**
 * Build an AuthorizationRequest from a tool call context.
 * Canonicalizes resources from the tool arguments.
 */
export function buildAuthorizationRequest(ctx: ToolCallContext): AuthorizationRequest {
  const { action, resourceKind } = toolToAction(ctx.toolName)
  const executable = resourceKind === "process" ? extractExecutable(ctx) : undefined
  const path = extractPath(ctx)
  const host = extractHost(ctx)

  const resource: CanonicalResource = {
    kind: resourceKind,
    path,
    host,
    // PDP matchExecutable("*") requires a non-empty executable string.
    executable,
    secretKind: extractSecretKind(ctx),
  }

  return {
    schemaVersion: "1",
    requestId: `req-${randomUUID()}`,
    principalId: ctx.principalId,
    sessionId: ctx.sessionId,
    contractId: ctx.contractId,
    contractRevision: ctx.contractRevision,
    criterionIds: ctx.criterionIds,
    workspaceId: ctx.workspaceId,
    tool: ctx.toolName,
    action,
    resource,
    executable,
    arguments: ctx.arguments ?? extractArguments(ctx),
    workingDirectory: ctx.workingDirectory ?? extractWorkingDirectory(ctx),
    networkDestination: ctx.networkDestination ?? host,
    provenance: ctx.provenance ?? ["USER_INSTRUCTION"],
    sensitivity: ctx.sensitivity ?? ["PUBLIC"],
    requestedAt: new Date().toISOString(),
    nonce: randomUUID(),
  }
}

function extractExecutable(ctx: ToolCallContext): string {
  if (ctx.executable && ctx.executable.length > 0) return ctx.executable
  const args = ctx.args
  const command = (args.command as string) ?? (args.cmd as string) ?? ""
  if (command.trim()) {
    // First token as executable best-effort (quoted paths supported loosely)
    const match = command.trim().match(/^("([^"]+)"|'([^']+)'|(\S+))/)
    const token = match?.[2] ?? match?.[3] ?? match?.[4]
    if (token) return token
  }
  // Fallback so wildcard process grants can match shell tools without a parsed binary
  return ctx.toolName || "shell"
}

function extractArguments(ctx: ToolCallContext): string[] | undefined {
  if (ctx.arguments) return ctx.arguments
  const command = (ctx.args.command as string) ?? (ctx.args.cmd as string)
  if (!command) return undefined
  return command.split(/\s+/).filter(Boolean)
}

function extractWorkingDirectory(ctx: ToolCallContext): string | undefined {
  if (ctx.workingDirectory) return ctx.workingDirectory
  return (ctx.args.workdir as string) ?? (ctx.args.cwd as string) ?? (ctx.args.working_directory as string) ?? undefined
}

function extractPath(ctx: ToolCallContext): string | undefined {
  const args = ctx.args
  // Common path argument names across tools
  return (args.path as string)
    ?? (args.filePath as string)
    ?? (args.target as string)
    ?? (args.dir as string)
    ?? undefined
}

function extractHost(ctx: ToolCallContext): string | undefined {
  if (ctx.networkDestination) return ctx.networkDestination
  const url = ctx.args.url as string | undefined
  if (url) {
    try {
      return new URL(url).hostname
    } catch {
      return undefined
    }
  }
  return undefined
}

function extractSecretKind(ctx: ToolCallContext): string | undefined {
  return (ctx.args.secretKind as string)
    ?? (ctx.args.key as string)
    ?? undefined
}

// ─── Authorized Execution Wrapper ─────────────────────────────────────

/**
 * Authorize and execute a tool effect through the PEP.
 *
 * @param ctx - Tool call context
 * @param execute - The actual effect callback (must use the exact request)
 * @param contextProvider - Fresh policy context source
 * @returns EnforcementResult
 */
export async function authorizeTool<T>(
  ctx: ToolCallContext,
  execute: (request: Readonly<AuthorizationRequest>) => T | Promise<T>,
  contextProvider: PolicyContextProvider,
): Promise<EnforcementResult<T>> {
  const request = buildAuthorizationRequest(ctx)

  const effect: PreparedEffect<T> = {
    request,
    executeExact: execute,
  }

  return authorizeAndExecute(effect, contextProvider)
}
