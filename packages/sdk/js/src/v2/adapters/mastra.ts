/**
 * Mastra adapter hook (E6): governs Mastra tool invocations.
 *
 * Mastra tool metadata (id, description, schema) is untrusted; it cannot
 * create authority. Every invocation becomes a canonical request with
 * MCP_DESCRIPTION provenance (the canonical untrusted-metadata label) and
 * executes only after ALLOW.
 */

import { toAuthorizationRequest, unionUntrustedProvenance, type GovernanceContext } from "../governance.js"
import { AuthorizationDeniedError, ApprovalRequiredError } from "../errors.js"
import { runGovernedExecute, type AuthorizeFn, type ExecuteExactFn } from "./ai-sdk.js"

export type MastraToolLike<Args extends Record<string, unknown>, Result> = {
  id: string
  description?: string
  inputSchema?: unknown
  execute: (args: Args) => Promise<Result>
}

export type GovernedMastraToolOptions = {
  context: Omit<GovernanceContext, "provenance"> & { provenance?: GovernanceContext["provenance"] }
  authorize: AuthorizeFn
  executeExact?: ExecuteExactFn
}

export function governedMastraTool<Args extends Record<string, unknown>, Result>(
  tool: MastraToolLike<Args, Result>,
  options: GovernedMastraToolOptions,
): MastraToolLike<Args, Result> {
  return {
    ...tool,
    execute: async (args: Args): Promise<Result> => {
      const context: GovernanceContext = {
        ...options.context,
        // Mastra metadata is untrusted; callers must declassify explicitly.
        provenance: unionUntrustedProvenance(options.context.provenance),
      }
      const request = toAuthorizationRequest({ name: `mastra.${tool.id}`, arguments: args }, context)
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
