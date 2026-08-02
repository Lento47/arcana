/**
 * E10: Certified adapter request-hash vectors.
 *
 * Frozen golden vectors pin the canonical mapping from framework tool calls
 * (AI SDK, MCP, Mastra, LangGraph naming) to AuthorizationRequest hashes.
 * Any change to tool-name mapping, argument serialization, or request
 * canonicalization breaks these vectors.
 */

import { describe, expect, it } from "bun:test"
import { toAuthorizationRequest, type GovernanceContext } from "../governance.js"

const CONTEXT: GovernanceContext = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  requestId: "req-vector-1",
  nonce: "nonce-vector-1",
  requestedAt: "2026-08-02T12:00:00.000Z",
  action: "process.execute",
  executable: "bun",
  workingDirectory: "/workspace",
  provenance: ["USER_INSTRUCTION"],
  sensitivity: ["INTERNAL"],
}

const VECTORS: Array<{
  name: string
  arguments: Record<string, unknown>
  requestHash: string
  serializedArguments: string[]
}> = [
  {
    name: "run",
    arguments: { command: "bun test" },
    requestHash: "cd8867376802c91c5a141e5baba5781b06cf3f714051ba9c929f7ccd0d1c3b20",
    serializedArguments: ["command=bun test"],
  },
  {
    name: "mcp.fs-server.read",
    arguments: { path: "/workspace/a.ts" },
    requestHash: "625b1cc4096114afe790ff72d8ddf4bdd38f0f3fffacba414cc46b3358794712",
    serializedArguments: ["path=/workspace/a.ts"],
  },
  {
    name: "mastra.read_file",
    arguments: { path: "/workspace/a.ts" },
    requestHash: "e629ec6319eb44fbd32ad0bd8aaa703d1b1ce86898fe30e8cea7cd0b2b905aa3",
    serializedArguments: ["path=/workspace/a.ts"],
  },
  {
    name: "langgraph.search",
    arguments: { query: "arcana" },
    requestHash: "6912218cd2f2ce1c5bce0c3f805f9d9c94e0d890afcae6e65237c18275a05b5a",
    serializedArguments: ["query=arcana"],
  },
]

describe("E10 certified adapter request-hash vectors", () => {
  it("reproduces the frozen golden hashes for every framework naming", () => {
    for (const vector of VECTORS) {
      const request = toAuthorizationRequest({ name: vector.name, arguments: vector.arguments }, CONTEXT)
      expect(request.tool).toBe(vector.name)
      expect(request.arguments).toEqual(vector.serializedArguments)
      expect(request.requestHash).toBe(vector.requestHash)
    }
  })

  it("is deterministic across repeated constructions", () => {
    for (const vector of VECTORS) {
      const first = toAuthorizationRequest({ name: vector.name, arguments: vector.arguments }, CONTEXT)
      const second = toAuthorizationRequest({ name: vector.name, arguments: vector.arguments }, CONTEXT)
      expect(second.requestHash).toBe(first.requestHash)
    }
  })
})
