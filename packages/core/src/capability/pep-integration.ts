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
  switch (toolName) {
    case "terminal":
      return { action: "process.execute", resourceKind: "process" }
    case "write_file":
    case "patch":
      return { action: "filesystem.write", resourceKind: "file" }
    case "read_file":
    case "search_files":
      return { action: "filesystem.read", resourceKind: "file" }
    case "send_message":
      return { action: "network.write", resourceKind: "network" }
    case "delegate_task":
      return { action: "delegate", resourceKind: "process" }
    case "cronjob":
      return { action: "process.execute", resourceKind: "process" }
    case "web_search":
    case "web_fetch":
      return { action: "network.read", resourceKind: "network" }
    case "image_generate":
    case "speak":
      return { action: "network.write", resourceKind: "network" }
    case "env_install":
      return { action: "process.execute", resourceKind: "process" }
    case "env_write":
      return { action: "filesystem.write", resourceKind: "file" }
    case "env_clean":
      return { action: "filesystem.delete", resourceKind: "file" }
    case "skill_create":
      return { action: "filesystem.write", resourceKind: "file" }
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

  const resource: CanonicalResource = {
    kind: resourceKind,
    path: extractPath(ctx),
    host: extractHost(ctx),
    executable: resourceKind === "process" ? ctx.executable : undefined,
    secretKind: extractSecretKind(ctx),
  }

  return {
    schemaVersion: "1",
    requestId: `req-${randomUUID()}`,
    principalId: ctx.principalId,
    sessionId: ctx.sessionId,
    contractId: ctx.contractId,
    tool: ctx.toolName,
    action,
    resource,
    executable: ctx.executable,
    arguments: ctx.arguments,
    workingDirectory: ctx.workingDirectory,
    networkDestination: ctx.networkDestination,
    provenance: ctx.provenance ?? ["USER_INSTRUCTION"],
    sensitivity: ctx.sensitivity ?? ["PUBLIC"],
    requestedAt: new Date().toISOString(),
    nonce: randomUUID(),
  }
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
