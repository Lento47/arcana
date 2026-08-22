/**
 * E10: Certified adapter request-hash vectors.
 *
 * Frozen golden vectors pin the canonical mapping from framework tool calls
 * (AI SDK, MCP, Mastra, LangGraph naming) to AuthorizationRequest hashes.
 * Any change to tool-name mapping, argument serialization, or request
 * canonicalization breaks these vectors.
 */

import { describe, expect, it } from "bun:test"
import { toAuthorizationRequest } from "../governance.js"
import { CERTIFIED_ADAPTER_CONTEXT, CERTIFIED_ADAPTER_VECTORS } from "./certified-vectors.js"

describe("E10 certified adapter request-hash vectors", () => {
  it("reproduces the frozen golden hashes for every framework naming", () => {
    for (const vector of CERTIFIED_ADAPTER_VECTORS) {
      const request = toAuthorizationRequest(
        { name: vector.name, arguments: vector.arguments },
        CERTIFIED_ADAPTER_CONTEXT,
      )
      expect(request.tool).toBe(vector.name)
      expect(request.arguments).toEqual([...vector.serializedArguments])
      expect(request.requestHash).toBe(vector.requestHash)
    }
  })

  it("is deterministic across repeated constructions", () => {
    for (const vector of CERTIFIED_ADAPTER_VECTORS) {
      const first = toAuthorizationRequest(
        { name: vector.name, arguments: vector.arguments },
        CERTIFIED_ADAPTER_CONTEXT,
      )
      const second = toAuthorizationRequest(
        { name: vector.name, arguments: vector.arguments },
        CERTIFIED_ADAPTER_CONTEXT,
      )
      expect(second.requestHash).toBe(first.requestHash)
    }
  })
})
