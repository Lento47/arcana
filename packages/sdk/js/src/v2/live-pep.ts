/**
 * SDK 1.0 live PEP transport (E6 / BLK-E-06).
 *
 * Lets a governed framework adapter authorize against a real running engine
 * over HTTP instead of an in-process callback. The client implements
 * AuthorizeFn and ExecuteExactFn by POSTing the canonical
 * AuthorizationRequest (with its exact requestHash) to the engine PEP
 * decision endpoint, maps the engine decision (ALLOW / DENY /
 * REQUIRE_APPROVAL / approval id) onto the SDK outcome types, and throws the
 * same errors the adapters expect (AuthorizationDeniedError,
 * ApprovalRequiredError). Transport failures fail closed: an unreachable
 * engine, a 5xx, or a malformed response is a TransportError — never an
 * allow.
 *
 * Engine contract (workspace-routed HTTP surface):
 *
 *   POST {base}/api/pep/decide        PEP decision endpoint
 *     body:  canonical AuthorizationRequest incl. requestHash
 *     query: directory?, workspace?   (WorkspaceRoutingQuery fields)
 *     auth:  Basic header or auth_token query (engine ServerAuth)
 *     200:   { decision: "ALLOW" }
 *            | { decision: "DENY"; reason?: string }
 *            | { decision: "REQUIRE_APPROVAL"; reason?: string; approvalId?: string }
 *            Each response may echo requestHash; a mismatch fails closed.
 *
 *   POST {base}/approvals/:approvalID/approve|deny|revoke
 *     body:  RuntimeApprovalCommandPayload
 *            { expectedVersion, expectedRequestHash, expectedContractRevision }
 *     query: directory?, workspace?
 *
 * The decision endpoint is the transport contract the engine mounts; the
 * approval command endpoints are the live runtime surface
 * (RuntimeApi group). The client is transport-only: it never decides, it
 * only relays the engine decision.
 */

import type { AuthorizationRequest } from "@arcana/core/capability/types"
import { AuthorizationDeniedError, ApprovalRequiredError, TransportError, toArcanaError } from "./errors.js"
import type { GovernanceContext } from "./governance.js"
import { governedTool, type AuthorizeFn, type ExecuteExactFn, type FrameworkTool } from "./adapters/ai-sdk.js"
import { governedMcpTool, type GovernedMcpToolOptions, type McpToolLike } from "./adapters/mcp.js"
import { governedMastraTool, type GovernedMastraToolOptions, type MastraToolLike } from "./adapters/mastra.js"
import {
  governedLangGraphTool,
  type GovernedLangGraphToolOptions,
  type LangGraphToolLike,
} from "./adapters/langgraph.js"

/** PEP decision endpoint path on the engine HTTP surface. */
export const PEP_DECIDE_PATH = "/api/pep/decide"

export type LivePepOptions = {
  /** Engine base URL, e.g. "http://localhost:4100". */
  baseUrl: string
  /**
   * Engine auth token. The engine ServerAuth middleware reads the
   * `auth_token` query param (base64 "user:pass"), so this is sent as
   * `?auth_token=`.
   */
  token?: string
  /** Basic auth username (engine ServerAuth middleware). */
  username?: string
  /** Basic auth password. */
  password?: string
  /** Extra headers merged onto every request (after auth headers). */
  headers?: Record<string, string>
  /**
   * Workspace selection: sent as the `x-arcana-directory` header. A
   * selection, never a grant: the engine treats header/query directories as
   * non-authoritative.
   */
  directory?: string
  /** Workspace routing query param (`workspace`). */
  workspace?: string
  /** Injectable fetch implementation (tests). */
  fetchImpl?: typeof fetch
}

/**
 * Engine decision response contract for the PEP decision endpoint.
 * `requestHash` is an optional echo; a mismatch fails closed.
 */
export type PepDecisionResponse =
  | { decision: "ALLOW"; requestHash?: string }
  | { decision: "DENY"; reason?: string; requestHash?: string }
  | {
      decision: "REQUIRE_APPROVAL"
      reason?: string
      approvalId?: string
      requestHash?: string
    }

/** SDK outcome for the live transport; assignable to AuthorizationOutcome. */
export type LivePepOutcome =
  | { decision: "ALLOW" }
  | { decision: "DENY"; reason: string }
  | { decision: "REQUIRE_APPROVAL"; reason: string; approvalId?: string }

/** Durable approval record wire shape (ApprovalRecordSchema). */
export type PepApprovalRecord = {
  approvalId: string
  version: number
  sessionId: string
  workspaceId: string
  requestHash: string
  contractRevision: number
  principalId?: string
  state: "PENDING" | "APPROVED" | "DENIED" | "REVOKED" | "CLAIMED" | "CONSUMED" | "EXPIRED" | "INVALIDATED"
  approvedBy?: string
  revokedBy?: string
  executionId?: string
  route?: "LOCAL_TUI" | "DESKTOP_PREFERRED" | "DESKTOP_REQUIRED" | "CENTRAL_REQUIRED"
  routingPolicyVersion?: string
  localFallbackAllowed?: boolean
  riskClass?: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
  expiresAt: string
  updatedAt: string
  createdAt: string
  [key: string]: unknown
}

/** RuntimeApprovalCommandPayload: the engine's operator command guard. */
export type RuntimeApprovalCommandPayload = {
  expectedVersion: number
  expectedRequestHash: string
  expectedContractRevision: number
}

/** RuntimeApprovalCommandResponse: success carries the updated record. */
export type ApprovalCommandResult =
  | { success: true; approval: PepApprovalRecord }
  | { success: false; reason: string; stale?: boolean }

export type LivePepClient = {
  /**
   * Authorize a canonical request against the live engine. Returns the
   * outcome; non-ALLOW is NOT thrown here (the adapters convert the outcome
   * into the stable errors). Transport failures throw TransportError.
   */
  authorize: (request: AuthorizationRequest & { requestHash: string }) => Promise<LivePepOutcome>
  /**
   * Enforcement-boundary execution: revalidates the request against the live
   * engine (fresh-context check, stale-decision rejection) and executes only
   * on ALLOW. Throws AuthorizationDeniedError / ApprovalRequiredError with
   * the requestHash (and approvalId when the engine parked one) in details.
   */
  executeExact: ExecuteExactFn
  /** Live runtime approval commands (RuntimeApi surface). */
  approvals: {
    list(): Promise<PepApprovalRecord[]>
    get(approvalId: string): Promise<PepApprovalRecord>
    approve(approvalId: string, payload: RuntimeApprovalCommandPayload): Promise<ApprovalCommandResult>
    deny(approvalId: string, payload: RuntimeApprovalCommandPayload): Promise<ApprovalCommandResult>
    revoke(approvalId: string, payload: RuntimeApprovalCommandPayload): Promise<ApprovalCommandResult>
  }
}

export function createLivePepClient(options: LivePepOptions): LivePepClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/+$/, "")

  const query = new URLSearchParams()
  if (options.workspace !== undefined) query.set("workspace", options.workspace)
  if (options.token !== undefined) query.set("auth_token", options.token)
  const querySuffix = query.size > 0 ? `?${query.toString()}` : ""

  function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    }
    if (options.directory !== undefined) {
      headers["x-arcana-directory"] = options.directory
    }
    if (options.username !== undefined || options.password !== undefined) {
      const credentials = btoa(`${options.username ?? ""}:${options.password ?? ""}`)
      headers.authorization = `Basic ${credentials}`
    }
    return { ...headers, ...options.headers }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}${querySuffix}`, {
        method,
        headers: baseHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      // Fail closed: an unreachable engine is never an allow.
      throw new TransportError(`pep transport: request failed: ${String(error)}`, { cause: error })
    }
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // Non-JSON error body: keep the raw text as details.
      }
      throw toArcanaError(response.status, parsed)
    }
    let parsed: unknown
    try {
      parsed = text === "" ? {} : JSON.parse(text)
    } catch {
      // Fail closed: a malformed success response is never an allow.
      throw new TransportError(`pep transport: non-JSON response: ${text.slice(0, 200)}`)
    }
    return parsed as T
  }

  /**
   * Fail closed on a decision whose requestHash echo does not match the
   * submitted request: the engine decided a different request, so this
   * decision must never be honored.
   */
  function assertRequestHashEcho(response: PepDecisionResponse, requestHash: string) {
    if (response.requestHash !== undefined && response.requestHash !== requestHash) {
      throw new TransportError("pep transport: decision requestHash does not match the submitted request", {
        responseRequestHash: response.requestHash,
        submittedRequestHash: requestHash,
      })
    }
  }

  async function decide(authRequest: AuthorizationRequest & { requestHash: string }): Promise<LivePepOutcome> {
    const response = await request<PepDecisionResponse>("POST", PEP_DECIDE_PATH, authRequest)
    if (response.decision === "ALLOW") {
      assertRequestHashEcho(response, authRequest.requestHash)
      return { decision: "ALLOW" }
    }
    if (response.decision === "DENY") {
      assertRequestHashEcho(response, authRequest.requestHash)
      return { decision: "DENY", reason: response.reason ?? "denied" }
    }
    if (response.decision === "REQUIRE_APPROVAL") {
      assertRequestHashEcho(response, authRequest.requestHash)
      return {
        decision: "REQUIRE_APPROVAL",
        reason: response.reason ?? "approval required",
        ...(typeof response.approvalId === "string" && response.approvalId.length > 0
          ? { approvalId: response.approvalId }
          : {}),
      }
    }
    // Unknown or missing decision: fail closed.
    throw new TransportError(`pep transport: unknown decision ${String((response as { decision?: unknown }).decision)}`)
  }

  const executeExact: ExecuteExactFn = async (authRequest, execute) => {
    const outcome = await decide(authRequest)
    if (outcome.decision === "DENY") {
      throw new AuthorizationDeniedError(outcome.reason, {
        requestHash: authRequest.requestHash,
      })
    }
    if (outcome.decision === "REQUIRE_APPROVAL") {
      throw new ApprovalRequiredError(outcome.reason, {
        requestHash: authRequest.requestHash,
        ...(outcome.approvalId !== undefined ? { approvalId: outcome.approvalId } : {}),
      })
    }
    return execute()
  }

  function approvalCommand(
    approvalId: string,
    command: "approve" | "deny" | "revoke",
    payload: RuntimeApprovalCommandPayload,
  ): Promise<ApprovalCommandResult> {
    return request<ApprovalCommandResult>("POST", `/approvals/${encodeURIComponent(approvalId)}/${command}`, payload)
  }

  return {
    authorize: decide,
    executeExact,
    approvals: {
      list: () => request<PepApprovalRecord[]>("GET", "/approvals"),
      get: (approvalId) => request<PepApprovalRecord>("GET", `/approvals/${encodeURIComponent(approvalId)}`),
      approve: (approvalId, payload) => approvalCommand(approvalId, "approve", payload),
      deny: (approvalId, payload) => approvalCommand(approvalId, "deny", payload),
      revoke: (approvalId, payload) => approvalCommand(approvalId, "revoke", payload),
    },
  }
}

// ─── Governed adapter wiring ────────────────────────────────────────────
//
// The hook-level adapters keep their exact API. These factories pass the
// live client's authorize/executeExact through, so a governed tool enforces
// against a real running engine: `governedToolWithLivePep(tool, { context,
// pep })` is the same hook with a live PEP behind it.

/** Internal generic factory shared by all governed*ToolWithLivePep variants. */
function makeGovernedToolWithLivePep<Tool, Context, Governed>(
  tool: Tool,
  options: { context: Context; pep: LivePepClient },
  govern: (
    tool: Tool,
    options: { context: Context; authorize: AuthorizeFn; executeExact?: ExecuteExactFn },
  ) => Governed,
): Governed {
  return govern(tool, {
    context: options.context,
    authorize: options.pep.authorize,
    executeExact: options.pep.executeExact,
  })
}

export function governedToolWithLivePep<Args extends Record<string, unknown>, Result>(
  tool: FrameworkTool<Args, Result>,
  options: { context: GovernanceContext; pep: LivePepClient },
): FrameworkTool<Args, Result> {
  return makeGovernedToolWithLivePep(tool, options, governedTool)
}

export function governedMcpToolWithLivePep<Args extends Record<string, unknown>, Result>(
  tool: McpToolLike<Args, Result>,
  options: { context: GovernedMcpToolOptions["context"]; pep: LivePepClient },
): McpToolLike<Args, Result> {
  return makeGovernedToolWithLivePep(tool, options, governedMcpTool)
}

export function governedMastraToolWithLivePep<Args extends Record<string, unknown>, Result>(
  tool: MastraToolLike<Args, Result>,
  options: { context: GovernedMastraToolOptions["context"]; pep: LivePepClient },
): MastraToolLike<Args, Result> {
  return makeGovernedToolWithLivePep(tool, options, governedMastraTool)
}

export function governedLangGraphToolWithLivePep<Args extends Record<string, unknown>, Result>(
  tool: LangGraphToolLike<Args, Result>,
  options: { context: GovernedLangGraphToolOptions["context"]; pep: LivePepClient },
): LangGraphToolLike<Args, Result> {
  return makeGovernedToolWithLivePep(tool, options, governedLangGraphTool)
}
