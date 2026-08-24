# Authority Kernel S4 — Process Isolation Design

> Status: DRAFT FOR ADR REVIEW · 2026-08-24
> Parent: [AUTHORITY-KERNEL.md](./AUTHORITY-KERNEL.md) §2 staging ladder (S4)
> Constitution note: this document proposes changes to how every tool handler
> obtains its effects. Implementation MUST NOT begin until the ADR below is
> accepted. PDP/PEP semantics are untouched by design — this relocates the
> enforcement POINT, not the rules.

---

## 1. Problem

Today the agent runtime and the Authority Kernel share one OS process
(`arcana run`, engine server). Stage S1–S3 make raw authority
*architecturally forbidden* (lint, confinement, credential hygiene), but a
compromised or buggy handler can still:

- call `node:child_process` / `Bun.spawn` directly (bypassing the gate),
- rebind module state or monkey-patch the in-process gate,
- read credentials from memory it shares with the kernel,
- signal or debug-attach the kernel (`Node.js inspector` class attacks).

Node/Bun permission systems are explicitly seat belts, not protection
against malicious code. Complete mediation without tamper-resistance is
therefore an interim claim — which is exactly what the honesty labels say.

## 2. Target shape (S4)

```text
┌────────────────────────────────┐        ┌─────────────────────────────┐
│  UNPRIVILEGED AGENT PROCESS    │        │  PRIVILEGED KERNEL PROCESS  │
│                                │        │                             │
│  coding loop · planners ·      │  IPC   │  PDP · approval · claims    │
│  skills · plugins · TUI logic  │◄──────►│  protected effect adapters  │
│                                │        │  grant store · receipts     │
│  NO kernel credentials         │        │  Ed25519 signing identity   │
│  NO inherited sensitive fds    │        │                             │
│  NO FFI/native addons          │        │                             │
└────────────────────────────────┘        └─────────────────────────────┘
```

Both processes run from the same repo and are launched together by a thin
supervisor (`arcana` entry point). The agent process holds no authority: it
can propose effects over IPC, but only the kernel can perform them.

### What does NOT change

- PDP semantics, policy providers, grant schemas — untouched.
- Gate *interfaces* (`authorizeProcess`, `authorizeFileMutation`,
  `authorizeNetwork`, `authorizeSecretUse`) keep their signatures; their
  implementations switch from in-process calls to RPC round-trips behind the
  same typed API. Callers don't change.
- Replay fixtures (K3a/K3b) run against the identical request shapes.

## 3. IPC contract (draft)

Transport: local named pipe / Unix domain socket, length-prefixed JSON
framing (canonical serialization reused from K3 hashing).

```text
Agent → Kernel:
  { v: 1, id: "<uuid>", kind: "process"|"fs"|"network"|"secret",
    payload: <gate request object>, auth: { instanceId } }

Kernel → Agent:
  { v: 1, id: "<same uuid>", ok: true, result: <gate result>,
    receiptHash?: string }
| { v: 1, id, ok: false, error: { code, message } }
```

Hard requirements:

| Requirement | Mechanism |
|---|---|
| Authenticated peer | Per-boot keypair; agent receives ONLY the public half at spawn time |
| No credential leak | Kernel never sends secret values across the wire; secrets resolve kernel-side |
| Bounded messages | Max frame size enforced both directions |
| Replay protection | Monotonic per-connection sequence number inside the authenticated frame |
| Liveness | Heartbeat; agent treats kernel death as fail-closed (all gates return DENIED_UNAVAILABLE) |
| Output gate | DISPATCHED transition committed before dispatch() invoked — structurally guaranteed because commit and dispatch happen in separate processes with an ack in between |

## 4. Acceptance criteria for S4 ("done" means ALL of these)

1. Kill-test matrix passes across process boundary:
   - crash kernel after CLAIMED before DISPATCH → restart → claim visible,
     reconcile works;
   - kill agent mid-dispatch → kernel marks AMBIGUOUS, unresolved queue
     surfaced;
   - concurrent double-claim attempts from TWO agent processes → one wins,
     loser gets DUPLICATE.
2. Agent process cannot: open effect_claims.db, sign checkpoints, reach
   network/fs beyond its sandbox, or attach the kernel debugger.
3. All existing capability fixtures pass unchanged (PDP untouched).
4. K3a/K3b replay suites pass against the IPC transport.
5. Latency budget: p95 IPC round-trip + mediation ≤ SLO budget × 1.5
   (documented relaxation; measured, not assumed).

## 5. Migration plan

| Step | Work | Risk |
|------|------|------|
| M-a | Extract `EffectTransport` interface from current in-process gate impls | low — interfaces already exist |
| M-b | Implement `LocalTransport` (in-process, current behavior) + `IpcTransport` (framing client) behind the interface | low |
| M-c | Supervisor entry point spawns both processes, hands agent its bootstrap config | medium |
| M-d | Default `LocalTransport`; flag `ARCANA_TRANSPORT=ipc` for opt-in testing | none |
| M-e | Flip default to IPC after soak; LocalTransport retained for tests/embedded | medium |

## 6. Open decisions requiring ADR / operator input

1. Transport technology: named pipe vs TCP-loopback vs Unix socket on each OS
   (Windows dev box vs Linux prod differ).
2. Serialization: JSON canonical (reuses K3 hashing) vs CBOR (binary-safe for
   file payloads — base64 tax on writes).
3. Whether the TUI keeps its local spawn bridge (grandfathered) or migrates
   to server-mediated commands once IPC lands.
4. Failure UX when kernel dies mid-run: agent exits vs degraded read-only mode.

## 7. Non-goals for S4

- Multi-kernel federation (that is Phase D/K8 territory — leases first).
- OS sandbox profiles (S5, after S4 stabilizes).
- Cross-machine kernel (never — kernel is always co-located with the user).

## 8. Effort estimate

| Item | Sessions |
|------|----------|
| EffectTransport extraction + LocalTransport | 1 |
| IPC framing + supervisor + IpcTransport | 2 |
| Kill-test matrix across boundary | 1 |
| Soak + flip default | 0.5 |
| **Total** | **~4.5 sessions** |
