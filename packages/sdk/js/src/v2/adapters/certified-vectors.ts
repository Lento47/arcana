import type { GovernanceContext } from "../governance.js"

/** Frozen identity used to reproduce the certified framework-adapter vectors. */
export const CERTIFIED_ADAPTER_CONTEXT: GovernanceContext = {
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

export type CertifiedAdapterVector = {
  readonly framework: "ai-sdk" | "mcp" | "mastra" | "langgraph"
  readonly name: string
  readonly arguments: Readonly<Record<string, unknown>>
  readonly requestHash: string
  readonly serializedArguments: readonly string[]
}

/**
 * Public ACEP-1 request-hash corpus for third-party adapter implementations.
 * A change is protocol-significant and must be reviewed as a compatibility
 * change rather than silently updating the expected hashes.
 */
export const CERTIFIED_ADAPTER_VECTORS: readonly CertifiedAdapterVector[] = [
  {
    framework: "ai-sdk",
    name: "run",
    arguments: { command: "bun test" },
    requestHash: "cd8867376802c91c5a141e5baba5781b06cf3f714051ba9c929f7ccd0d1c3b20",
    serializedArguments: ["command=bun test"],
  },
  {
    framework: "mcp",
    name: "mcp.fs-server.read",
    arguments: { path: "/workspace/a.ts" },
    requestHash: "625b1cc4096114afe790ff72d8ddf4bdd38f0f3fffacba414cc46b3358794712",
    serializedArguments: ["path=/workspace/a.ts"],
  },
  {
    framework: "mastra",
    name: "mastra.read_file",
    arguments: { path: "/workspace/a.ts" },
    requestHash: "e629ec6319eb44fbd32ad0bd8aaa703d1b1ce86898fe30e8cea7cd0b2b905aa3",
    serializedArguments: ["path=/workspace/a.ts"],
  },
  {
    framework: "langgraph",
    name: "langgraph.search",
    arguments: { query: "arcana" },
    requestHash: "6912218cd2f2ce1c5bce0c3f805f9d9c94e0d890afcae6e65237c18275a05b5a",
    serializedArguments: ["query=arcana"],
  },
]
