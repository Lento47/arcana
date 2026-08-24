# Arcana ecosystem and distribution

Arcana's ecosystem surface is deliberately smaller than its runtime surface. The repository contains working integrations; publication, external adoption, and partner certification remain separate gates.

## Install and run

```bash
npx arcana-ai
# or
npm install -g arcana-ai
arcana
```

Release binaries are built for supported targets by the release workflow. Tagged builds require ACEP-1 conformance, signed checksum material, and an attached machine-readable conformance report before npm publication completes.

## Integration matrix

| Integration      | Source                                         | Frozen request-hash vector | Project-maintained tests | External certification |
| ---------------- | ---------------------------------------------- | -------------------------: | -----------------------: | ---------------------: |
| Vercel AI SDK    | `packages/sdk/js/src/v2/adapters/ai-sdk.ts`    |                        Yes |                      Yes |           Not assessed |
| MCP              | `packages/sdk/js/src/v2/adapters/mcp.ts`       |                        Yes |                      Yes |           Not assessed |
| Mastra           | `packages/sdk/js/src/v2/adapters/mastra.ts`    |                        Yes |                      Yes |           Not assessed |
| LangGraph naming | `packages/sdk/js/src/v2/adapters/langgraph.ts` |                        Yes |                      Yes |           Not assessed |

The vectors are exported from `@arcana/sdk/v2/adapters` as `CERTIFIED_ADAPTER_CONTEXT` and `CERTIFIED_ADAPTER_VECTORS`. “Certified” here means the mapping is pinned by Arcana's public conformance corpus; it does not mean the framework vendor has endorsed it.

## Adapter compatibility contract

Every governed adapter must:

1. Map the framework call to the exact canonical authorization request.
2. Send that request to the policy enforcement point before execution.
3. Execute only on an `ALLOW` decision bound to the same request identity.
4. Preserve `DENY` and `REQUIRE_APPROVAL` as non-execution outcomes.
5. Produce evidence that lets an operator connect the framework call, decision, and execution result.
6. Pass the certified request-hash vectors without changing their expected outputs.

An adapter that only logs decisions, checks after execution, or allows framework approval to bypass the PEP is not compatible.

## Distribution work still requiring external action

- Publish and verify the SDK package from a frozen release candidate.
- Validate installation and upgrade paths on the release OS matrix.
- Obtain one maintained external adapter or integration from outside the Arcana repository.
- Run two design-partner pilots with documented setup time, governed executions, denial/approval outcomes, and operator feedback.
- Publish L3 reproduction evidence and the later L4 review described in [ASSURANCE.md](ASSURANCE.md).

These items are not represented as complete by internal CI.
