/**
 * SDK 1.0 framework adapters (E6).
 *
 * Adapter hooks map framework tool calls onto canonical AuthorizationRequests
 * and execute only after an ALLOW. Framework approval flows can never bypass
 * the PEP: the hook is the final gate before `execute`.
 */

export * from "./ai-sdk.js"
export * from "./mcp.js"
