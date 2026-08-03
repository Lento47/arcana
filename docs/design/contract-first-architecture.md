# Contract-First Architecture: Arcana Runtime and Desktop

**Status: BINDING DESIGN. Applies to all agents and all work in both repos.**

**Last updated: 2026-08-02. Owner: arcana architecture (Zero Trust + Epistemic Assurance).**

## 1. The principle

One durable log. Three projections. No client owns truth.

The Arcana runtime owns all authority: durable governance state, approval routing, PDP/PEP, event projection, evidence, and the API contract. Arcana Desktop is a thin client that renders projections of the runtime log and submits commands. The CLI/TUI is the AI work surface. Desktop is the local approval, governance, and forensic surface. Both render the same runtime events independently.

The sidecar and Desktop never own authority. Desktop can request, inspect, approve, deny, revoke, display evidence, display proofs, manage UI preferences, and notify. Desktop cannot make the PDP decision, authorize independently, execute tools, consume an approval, fabricate proof, write runtime governance state, or trust cached approvals while offline.

## 2. The contract artifact (the linchpin)

The contract is two versioned, machine-readable files in the Arcana repo:

- `contracts/approval-api.v1.yaml` (OpenAPI). Defines every runtime endpoint Desktop consumes.
- `contracts/events.v1.json` (JSON Schema). Defines every governance event in the catalog.

Desktop codegens its client from these files. Desktop pins a contract version. The handshake compares `PROTOCOL_REVISION`; a mismatch means refuse to attach and surface `VERSION_MISMATCH`.

The dependency rule is enforced as a compile error, not a convention. Arcana changes the artifact. Desktop regenerates, or it fails to build. Desktop physically cannot write a competing schema.

## 3. The durable log and event transport

The runtime event store is append-only. Every governance event carries a durable identity and a monotonic sequence number.

Transport contract (`GET /event`, SSE):

- ten-second heartbeat, client tracks `nextHeartbeat`
- sequence continuity check on every frame
- gap detected: REST resync via `GET /events/since/<seq>`
- bounded reconnect backoff: 1s, 2s, 4s, 8s, cap 30s
- deduplication by durable event identity, never by payload
- no invented events, no silent loss

Every event envelope includes:

```json
{
  "transport": {
    "streamId": "string",
    "sequence": 1,
    "nextHeartbeat": 10
  },
  "event": { "type": "governance.recorded", "payload": {} }
}
```

The Desktop approval inbox is a materialized view of the sequence range it has seen. Reconnect means replay the missed range and upsert. Lossless recovery is defined as: after daemon or Desktop restart, no authoritative event is missing and none is duplicated.

## 4. Approval state machine

One implementation, runtime-owned. Durable state only in the runtime.

```
PENDING -> APPROVED -> CLAIMED -> CONSUMED
```

Desktop renders and submits commands. The approve path revalidates before any effect:

- exact request hash
- request identity and nonce
- approval status and expiry
- capability status and use count
- current intent and contract revision
- policy compatibility
- workspace trust
- revocation state
- single-use claim

Operator identity is derived from authenticated server context. Never from the request body. A client-supplied `approvedBy`, `actorUserId`, or equivalent field is rejected at the boundary. This is a test, not a preference.

Approval does not directly execute an effect. The runtime receives the decision, revalidates the exact request, then PEP executes or denies. Receipt, evidence, and RunProof are appended to the log.

## 5. Approval routing

Policy-driven by workspace, action, capability, risk class, and deployment mode.

```ts
type ApprovalRoute =
  | "LOCAL_TUI"          // TUI displays and decides locally
  | "DESKTOP_PREFERRED"  // route to Desktop when a live subscriber exists; TUI fallback only if policy permits
  | "DESKTOP_REQUIRED"   // stays PENDING when Desktop unavailable; no silent fallback
  | "CENTRAL_REQUIRED"   // local surfaces inspect only; Arcana Control decides
```

Desktop subscriber awareness is advisory. Heartbeat with expiry, not a boolean. A subscriber is unavailable when no heartbeat arrives for 30 seconds. Stale subscribers automatically become unavailable. Awareness may influence routing. It can never authorize an action, extend approval expiry, fabricate an operator identity, consume an approval, change a PDP result, or execute an effect.

## 6. Runtime API surface (narrow, fixed)

- `GET /health`
- `GET /sessions`, `GET /sessions/:sessionId`
- `GET /approvals`, `GET /approvals/:approvalId`
- `POST /approvals/:approvalId/approve`
- `POST /approvals/:approvalId/deny`
- `POST /approvals/:approvalId/revoke`
- `GET /event` (SSE)
- `GET /proofs/:sessionId`

Loopback only, ports 9142-9150. Desktop never auto-connects to a non-loopback endpoint without explicit secure configuration and credentials.

Reuse existing services and durable approval state. Never a second approval implementation.

## 7. Desktop host

Rust owns the trust boundary: sidecar process lifecycle, PID verification, local IPC, PTY when introduced, SSE supervision, reconnect and resync, evidence transport, cryptographic verification, native notifications, installer and update integration.

Sidecar lifecycle state machine, all transitions observable and testable:

```
NOT_INSTALLED -> STARTING -> CONNECTING -> HEALTHY
HEALTHY -> DEGRADED -> RECONNECTING -> RESYNCING -> HEALTHY
HEALTHY -> STOPPING -> STOPPED
STARTING -> CRASHED
CONNECTING -> VERSION_MISMATCH
```

A PID file alone is not proof of life. Validate: PID is nonzero, the process exists, the process identity matches the expected Arcana binary where possible, port health matches the expected daemon, stale PID is removed or ignored, and process replacement cannot be mistaken for the old daemon.

The SolidJS UI is an untrusted presentation client. It invokes only narrow domain commands: `runtime_status`, `runtime_start`, `runtime_stop`, `list_sessions`, `list_approvals`, `get_approval`, `approve_request`, `deny_request`, `revoke_approval`, `get_run_proof`, `open_terminal_view`. Every argument is validated in Rust. Never expose generic commands: `execute_shell`, `read_any_file`, `write_any_file`, `spawn_arbitrary_process`, `raw_database_access`.

Error model: pass through runtime errors with their existing `ARC_*` codes. Desktop-host failures use `DTSK_*`: `DTSK_SIDECAR_NOT_FOUND`, `DTSK_SIDECAR_START_FAILED`, `DTSK_SIDECAR_EXITED`, `DTSK_PID_STALE`, `DTSK_PROTOCOL_MISMATCH`, `DTSK_STREAM_GAP`, `DTSK_RESYNC_FAILED`, `DTSK_NOTIFICATION_FAILED`, `DTSK_UPDATE_FAILED`. Never translate an `ARC_*` authorization error into a generic desktop error.

## 8. Projection rules

CLI/TUI default rendering aggregates healthy governance events into one compact lifecycle projection. Security-critical events always break through filtering: approval required, denial, capability revocation, request mutation after approval, runtime disconnection, degraded or missing evidence, unknown execution state after crash, revalidation failure.

Three visibility modes:

- conversation: user and assistant communication, concise summaries, compact tool receipts, approval waits, final proof summary
- operations: grouped tool executions, grouped governance lifecycle, capabilities, timing, approval transitions
- forensic: canonical requests, request hashes, policy versions, event sequences, raw payloads, complete RunProof evidence

Raw evidence is never deleted or weakened. Only the default projection changes.

Desktop presentation follows the same rules. Degraded evidence renders as degraded. Absent evidence never renders as healthy. A notification announces an event; it is never an authorization control. Clicking a notification opens the detail screen. No one-click approval in M1.

## 9. Offline semantics

When the runtime is unreachable, Desktop shows offline or degraded, marks cached data stale, disables approve/deny/revoke, and never queues authority decisions locally. Reconnect and resync complete before commands re-enable. The runtime remains authoritative while Desktop is closed. On reopen, Desktop discovers all still-pending approvals.

## 10. Sequencing (the dependency rule)

1. Arcana defines and tests the runtime approval and event contract.
2. Desktop consumes the contract.
3. Desktop may build lifecycle, packaging, connection, resync, shell, and mock approval UI immediately.
4. Desktop must not hard-code a competing final approval schema while the contract is changing.

## 11. Definition of done for the release gate

Kill or restart the daemon or Desktop. Recover without missing or duplicating authoritative events. Show live updates without polling. Proof includes: real child-process lifecycle tests, real PID liveness tests, heartbeat-stall and restart recovery, exact event sequence and deduplication tests, sidecar build and bundle verification, runtime version compatibility check, Windows installer or bundle proof, and `m1-signoff.md` with exact commands and outputs.
