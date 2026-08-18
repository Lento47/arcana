/**
 * MCP adapter hook (E6): governs MCP tool invocations.
 *
 * MCP tool names, schemas, and descriptions are untrusted metadata; they
 * cannot create authority. Every invocation becomes a canonical request with
 * MCP_DESCRIPTION provenance and executes only after ALLOW.
 */

import { toAuthorizationRequest, unionUntrustedProvenance, type GovernanceContext } from "../governance.js"
import { AuthorizationDeniedError, ApprovalRequiredError } from "../errors.js"
import { runGovernedExecute, type AuthorizeFn, type ExecuteExactFn } from "./ai-sdk.js"

export type McpToolLike<Args extends Record<string, unknown>, Result> = {
  server: string
  name: string
  schemaDigest?: string
  execute: (args: Args) => Promise<Result>
}

export type GovernedMcpToolOptions = {
  context: Omit<GovernanceContext, "provenance"> & { provenance?: GovernanceContext["provenance"] }
  authorize: AuthorizeFn
  executeExact?: ExecuteExactFn
}

export function governedMcpTool<Args extends Record<string, unknown>, Result>(
  tool: McpToolLike<Args, Result>,
  options: GovernedMcpToolOptions,
): McpToolLike<Args, Result> {
  return {
    ...tool,
    execute: async (args: Args): Promise<Result> => {
      const context: GovernanceContext = {
        ...options.context,
        // MCP metadata is untrusted: provenance defaults to MCP_DESCRIPTION
        // and callers must declassify explicitly to add USER_INSTRUCTION.
        provenance: unionUntrustedProvenance(options.context.provenance),
      }
      const request = toAuthorizationRequest({ name: `mcp.${tool.server}.${tool.name}`, arguments: args }, context)
      const outcome = await options.authorize(request)
      if (outcome.decision !== "ALLOW") {
        if (outcome.decision === "REQUIRE_APPROVAL") {
          throw new ApprovalRequiredError(outcome.reason ?? "approval required", {
            requestHash: request.requestHash,
          })
        }
        throw new AuthorizationDeniedError(outcome.reason ?? "denied", {
          requestHash: request.requestHash,
        })
      }
      return runGovernedExecute(options.executeExact, request, () => tool.execute(args))
    },
  }
}
