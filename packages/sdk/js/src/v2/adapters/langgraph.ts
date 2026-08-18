/**
 * LangGraph adapter hook (E6): governs LangGraph/LangChain tool invocations.
 *
 * LangGraph tool metadata (name, description, schema) is untrusted; it
 * cannot create authority. Every invocation becomes a canonical request with
 * MCP_DESCRIPTION provenance (the canonical untrusted-metadata label) and
 * executes only after ALLOW.
 */

import { toAuthorizationRequest, unionUntrustedProvenance, type GovernanceContext } from "../governance.js"
import { AuthorizationDeniedError, ApprovalRequiredError } from "../errors.js"
import { runGovernedExecute, type AuthorizeFn, type ExecuteExactFn } from "./ai-sdk.js"

export type LangGraphToolLike<Args extends Record<string, unknown>, Result> = {
  name: string
  description?: string
  schema?: unknown
  invoke: (args: Args) => Promise<Result>
}

export type GovernedLangGraphToolOptions = {
  context: Omit<GovernanceContext, "provenance"> & { provenance?: GovernanceContext["provenance"] }
  authorize: AuthorizeFn
  executeExact?: ExecuteExactFn
}

export function governedLangGraphTool<Args extends Record<string, unknown>, Result>(
  tool: LangGraphToolLike<Args, Result>,
  options: GovernedLangGraphToolOptions,
): LangGraphToolLike<Args, Result> {
  return {
    ...tool,
    invoke: async (args: Args): Promise<Result> => {
      const context: GovernanceContext = {
        ...options.context,
        // LangGraph metadata is untrusted; callers must declassify explicitly.
        provenance: unionUntrustedProvenance(options.context.provenance),
      }
      const request = toAuthorizationRequest({ name: `langgraph.${tool.name}`, arguments: args }, context)
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
      return runGovernedExecute(options.executeExact, request, () => tool.invoke(args))
    },
  }
}
