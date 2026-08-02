# Adapter Certification Registry (E7 draft)

Certification levels (playbook §34/E7):

| Level | Meaning | Boundary claim |
|---|---|---|
| A3 | Native exact-effect integration | Tool calls flow through the Arcana PEP before the effect; highest fidelity |
| A2 | Sandboxed black-box process | OS-level filesystem/process/network/secret constraints |
| A1 | PTY/process observation | Arcana supervises the process and mediates what is interceptable; explicitly lower fidelity |
| A0 | Telemetry only | No enforcement claim |

Every certification record must state: boundaries covered, known bypasses,
test version, protocol version, and operating systems.

## Registry

| Adapter | Level | Boundaries covered | Known bypasses | Status |
|---|---|---|---|---|
| SDK governed tool hook (AI SDK-style tools) | A3 (scaffold) | Tool-call → canonical AuthorizationRequest; ALLOW-only execution; exact-request binding; framework approval cannot bypass the hook | Requires a real PEP transport (authorize/executeExact callbacks) — no sandbox for the executor | DRAFT (E6) |
| `arcana launch <runtime>` (Codex/Claude/Gemini) | A1 (target declaration) | Process supervision + evidence capture only; NO sandbox/interception claim | All effects not mediated by the wrapper remain outside Arcana | NOT IMPLEMENTED (E5) |
| MCP gateway | — | Planned | — | PLANNED |

## Certification procedure

1. Declare level + boundaries + bypasses in this registry.
2. Run the hostile-escape fixture set for the declared boundary; record
   blocked vs unblocked outcomes honestly.
3. Record protocol version (`1.0-draft`), test version, and OS matrix.
4. Independent review (L3+) before any production certification claim.

## Nonclaims

- No adapter may claim a level it has not passed the fixture set for.
- A1 does not equal A2; PTY observation is not kernel containment.
- Processes launched outside the adapter boundary are out of scope.
