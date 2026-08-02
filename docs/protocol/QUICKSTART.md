# Quickstart — Govern a tool call with the SDK

```ts
import {
  buildAuthorizationRequest,
  toAuthorizationRequest,
  verifySignedEnvelope,
} from "@arcana/sdk/v2/governance"
import { verifyRunProofExport } from "@arcana/sdk/v2/proof"

// 1. Build a canonical request (exact hash binding).
const request = toAuthorizationRequest(
  { name: "run", arguments: { command: "bun test" } },
  {
    principalId: "agent:build",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    contractId: "contract-1",
    contractRevision: "3",
    action: "process.execute",
    executable: "bun",
    provenance: ["USER_INSTRUCTION"],
    sensitivity: ["INTERNAL"],
  },
)

// 2. Submit to the PEP (adapter hook — the request must never be mutated).
const decision = await authorize(request) // your PEP transport
if (decision.decision !== "ALLOW") throw new Error(`denied: ${decision.reason}`)

// 3. Execute the EXACT request (same hash) and collect the receipt.
const receipt = await executeExact(request, async () => runCommand())

// 4. Verify a returned signed envelope / exported proof independently.
const envelopeOk = verifySignedEnvelope(receipt.envelopeJson, "arcana:signed-capability:v1", publicKey)
const proofOk = verifyRunProofExport(exportedProofJson)
```

Enforcement levels: declare your adapter level (A3 native, A2 sandboxed,
A1 PTY, A0 telemetry) and its known bypasses before claiming coverage.
