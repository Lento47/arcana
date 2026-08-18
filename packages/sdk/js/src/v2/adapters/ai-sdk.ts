/**
 * AI SDK adapter hook (E6): wraps a framework tool so every invocation goes
 * through the canonical authorization path.
 */

import type { AuthorizationRequest } from "@arcana/core/capability/types"
import { toAuthorizationRequest, type GovernanceContext } from "../governance.js"
import { AuthorizationDeniedError, ApprovalRequiredError, InvalidRequestError } from "../errors.js"

export type AuthorizationOutcome = { decision: "ALLOW" } | { decision: "DENY" | "REQUIRE_APPROVAL"; reason: string }

export type AuthorizeFn = (request: AuthorizationRequest & { requestHash: string }) => Promise<AuthorizationOutcome>

export type ExecuteExactFn = <T>(
  request: AuthorizationRequest & { requestHash: string },
  execute: () => Promise<T>,
) => Promise<T>

export type FrameworkTool<Args extends Record<string, unknown>, Result> = {
  name: string
  description?: string
  argsSchema?: unknown
  execute: (args: Args) => Promise<Result>
}

export type GovernedToolOptions = {
  context: GovernanceContext
  authorize: AuthorizeFn
  executeExact?: ExecuteExactFn
}

/**
 * Wrap a framework tool with the governance hook. The exact canonical
 * request (with request hash) is submitted to `authorize`; only ALLOW
 * reaches the tool's executor. ALLOW must run through `executeExact`
 * (fresh-context PEP). Callers that omit it fail closed.
 */
export async function runGovernedExecute<T>(
  executeExact: ExecuteExactFn | undefined,
  request: AuthorizationRequest & { requestHash: string },
  execute: () => Promise<T>,
): Promise<T> {
  if (!executeExact) {
    throw new InvalidRequestError("executeExact is required after ALLOW")
  }
  return executeExact(request, execute)
}

export function governedTool<Args extends Record<string, unknown>, Result>(
  tool: FrameworkTool<Args, Result>,
  options: GovernedToolOptions,
): FrameworkTool<Args, Result> {
  return {
    ...tool,
    execute: async (args: Args): Promise<Result> => {
      const request = toAuthorizationRequest({ name: tool.name, arguments: args }, options.context)
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
