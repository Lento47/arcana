# Arcana Deployment Runbook

**Document class:** operational runbook
**Authority:** secondary — status lives in `docs/STATUS.md`, blockers in `docs/BLOCKERS.md`
**Created:** 2026-08-05
**Scope:** BLK-D-07 — deployment topology, trust bootstrap, backup/DR, monitoring, fail-closed defaults

This runbook documents the operational procedures for deploying and operating an
Arcana distributed-authority system. Every command and endpoint referenced here
is verified against the source code in this repository. Where a capability is
**not yet implemented**, it is stated explicitly rather than documented as if it
exists.

---

## 1. Topology

### 1.1 Deployment Units

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OPERATOR WORKSTATION                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  Arcana CLI   │    │  Arcana TUI  │    │  arcana node client  │  │
│  │  (commands)   │    │  (terminal)  │    │  (enroll/sync/up)   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │              │
│         └───────────────────┼───────────────────────┘              │
│                             │                                      │
│                    ┌────────▼────────┐                             │
│                    │  Arcana Daemon   │                             │
│                    │  (local server)  │                             │
│                    │  port 9142-9150  │                             │
│                    └────────┬────────┘                             │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
                              │  HTTP (plain — NO TLS, see §2.4)
                              │
┌─────────────────────────────▼──────────────────────────────────────┐
│                        CONTROL PLANE                                │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  arcana serve / arcana web                                   │  │
│  │  - enrollment endpoints (/api/nodes/*)                       │  │
│  │  - enterprise API (/api/enterprise/*)                        │  │
│  │  - global events SSE (/global/event)                         │  │
│  │  - health endpoints (/health, /global/health)                │  │
│  │  - mDNS discovery (arcana.local, bonjour-service)            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Summary

| Unit | Entrypoint | Role |
|------|-----------|------|
| **Arcana CLI** | `arcana <command>` | Operator commands: session, node, proof, serve, doctor, daemon |
| **Arcana TUI** | `arcana tui` | Interactive terminal UI (SolidJS + OpenTUI) |
| **Arcana Node** | `arcana node <action>` | Lightweight node client: enroll, proof upload, sync, status |
| **Arcana Daemon** | auto-start on first `arcana` call | Local background server (ports 9142–9150) |
| **Control Plane** | `arcana serve` / `arcana web` | Headless HTTP server: enrollment, enterprise, events |
| **Enterprise API** | `/api/enterprise/*` | Fleet, policy, approvals, audit, reliability, SIEM |
| **Arcana SDK** | `@arcana/sdk` | Typed client library for programmatic access |

### 1.3 Ports & Bindings

| Service | Default Port | Config |
|---------|-------------|--------|
| Daemon | 9142–9150 (auto-scan) | first available in range |
| Serve | 0 (auto: tries 4096, then any) | `--port` flag |
| mDNS | N/A (UDP 5353) | `--mdns` flag, `--mdns-domain` |

**Security invariant (ARC-SEC-I08):** Non-loopback binds (`--hostname 0.0.0.0`)
require `ARCANA_SERVER_PASSWORD` to be set, or the server refuses to start.

---

## 2. Trust Bootstrap

### 2.1 Enrollment Ceremony Overview

The node enrollment ceremony is a three-step protocol:

```
┌─────────────┐                ┌──────────────────┐                ┌─────────────┐
│   ISSUER     │                │   CONTROL PLANE   │                │    NODE      │
│  (ops/admin) │                │  (arcana serve)   │                │ arcana node  │
└──────┬───────┘                └────────┬─────────┘                └──────┬───────┘
       │                                 │                                  │
       │  1. createJoinToken()           │                                  │
       │  ──────────────────────►        │                                  │
       │  (offline, Ed25519-signed)      │                                  │
       │                                 │                                  │
       │         2. token delivered to node (out-of-band)                  │
       │                                 │                                  │
       │                                 │    3. POST /api/nodes/enroll     │
       │                                 │    ◄──────────────────────────── │
       │                                 │    { joinToken, publicKey }      │
       │                                 │                                  │
       │                                 │    4. verify token, issue cert   │
       │                                 │    ──────────────────────────── ─►
       │                                 │    { kind: "ENROLLED", record }  │
       │                                 │                                  │
       │                                 │         5. node persists         │
       │                                 │         .arcana/node-identity.json│
       └─────────────────────────────────┴──────────────────────────────────┘
```

### 2.2 Issuer Side: Creating a Join Token

The issuer mints a short-lived join token bound to a specific node identity:

```typescript
// packages/core/src/crypto/node-enrollment.ts
import { createJoinToken } from "@arcana/core/crypto/node-enrollment"

const token = createJoinToken(
  {
    organizationId: "org-abc",
    trustDomain: "prod.example.com",
    nodeId: "node-001",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000), // 1 hour
  },
  issuerSecretKey, // Ed25519 secret key (32 bytes)
)
```

**Properties verified by the control plane:**
- `schemaVersion === 1`
- `organizationId`, `trustDomain`, `nodeId` match expected values
- `expiresAt` not past
- `issuedAt` not more than 5 minutes in the future
- Ed25519 signature valid against trusted issuer public keys

### 2.3 Node Side: Enrollment Command

```bash
arcana node enroll \
  --token '<join-token-json>' \
  --key '<base64url-ed25519-32-byte-seed>' \
  --endpoint 'http://control-plane:4096' \
  --directory /path/to/workspace
```

**What happens internally:**

1. Checks the workspace is not already enrolled (reads `.arcana/node-identity.json`)
2. Validates the `--key` is a 32-byte Ed25519 seed
3. Generates keypair via `ed25519.keygen(seed)`
4. POSTs to `/api/nodes/enroll` with `{ joinToken, publicKey }`
5. On success: persists identity to `.arcana/node-identity.json` (mode `0o600`)
6. On rejection: prints the reason, does NOT persist identity

**Identity file schema** (`.arcana/node-identity.json`):

```json
{
  "nodeId": "node-001",
  "trustDomain": "prod.example.com",
  "secretKeyB64": "<base64url-ed25519-secret-key>",
  "publicKeyB64": "<base64url-ed25519-public-key>",
  "nodeKeyEpoch": 1,
  "certificate": { /* NodeIdentityCertificate */ },
  "enrolledAt": "2026-08-05T12:00:00.000Z"
}
```

### 2.4 TLS/mTLS — NOT YET IMPLEMENTED

**Status: Transport-layer security is not implemented.**

- The Arcana engine creates a plain HTTP server via `node:http createServer()` (`packages/engine/src/server/server.ts:215`)
- There is NO `node:tls` import, NO `https.createServer`, NO certificate/key file loading
- There is NO `ARCANA_TLS` / `ARCANA_CERT` / `ARCANA_KEY` environment variable
- The only security at transport layer is the loopback-only default binding + `ARCANA_SERVER_PASSWORD` requirement for non-loopback binds (ARC-SEC-I08)

**What IS secured at the message layer:**
- Join tokens are Ed25519-signed and audience-bound (org/trustDomain/nodeId)
- Node identity certificates are Ed25519-signed
- Revocation statements are Ed25519-signed with monotonic sequence numbers
- Sync transport uses signed envelopes

**Operational consequence:** All node-to-control-plane communication travels over
unencrypted HTTP. In production deployments, TLS termination must be provided by a
reverse proxy (nginx, Caddy, HAProxy) or service mesh in front of `arcana serve`.
This is tracked as **BLK-D-07** in the blocker register.

### 2.5 Key Rotation

Rotating a node's key advances the `nodeKeyEpoch` and supersedes the previous key.
The rotated key is rejected by both the HTTP endpoint and the offline `verifyNodeKey`
function (epoch + key must match current registry values).

```bash
arcana node key rotate \
  --endpoint 'http://control-plane:4096' \
  --directory /path/to/workspace \
  [--key '<new-base64url-seed>']  # omit for random new key
```

**Rotation protocol:**

1. Node loads current identity from `.arcana/node-identity.json`
2. Generates new keypair (or uses provided `--key`)
3. POSTs new public key to `/api/nodes/:nodeId/rotate`
4. Control plane validates node is `TRUSTED`, new key differs from current
5. Issues new certificate at `epoch + 1`
6. Node persists updated identity (new secret, public key, epoch, certificate)

**Rejection conditions:**
- Node not enrolled
- Node status is not `TRUSTED` (e.g., `SUSPENDED`, `REVOKED`)
- New public key equals current key (no-op rotation rejected)

### 2.6 Decommissioning / Revocation

Decommissioning a node sets its status to `REVOKED`. **Re-enrollment of a
decommissioned node is permanently rejected** — the only path back is a new
node identity with a new nodeId.

Revocation is published as a signed statement in the D-5 revocation store
(`packages/core/src/crypto/revocation-store.ts`):

- Sequence-monotonic: each statement has a strictly increasing sequence number
- Rollback-protected: sequence cannot go backwards
- Digest-chained: SHA-256 digest of signed statement JSON
- Emergency-epoch ordered for priority propagation

---

## 3. Backup / Restore / Disaster Recovery

### 3.1 F7 Reliability Targets

| Metric | Target | Definition |
|--------|--------|-----------|
| Availability | 99.9% | `availabilityTarget: 0.999` |
| RPO | 15 minutes | Maximum data loss window |
| RTO | 1 hour | Maximum recovery time |

Source: `packages/core/src/enterprise/reliability.ts:16-20`

### 3.2 Backup Operations

Backup/restore is accessible **only via the HTTP API** — there are no CLI
commands for backup or restore operations.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/enterprise/organizations/:tenantId/reliability/backups` | Record a digest-verified backup |
| `POST` | `/api/enterprise/organizations/:tenantId/reliability/backups/:backupId/restore` | Restore when digest matches |
| `POST` | `/api/enterprise/organizations/:tenantId/reliability/drills` | Record and evaluate a restore drill |
| `GET` | `/api/enterprise/organizations/:tenantId/reliability/drills` | List restore drills |

### 3.3 Backup Record Schema

```typescript
type BackupRecord = {
  tenantId: string
  backupId: string
  kind: "DATABASE" | "KEYS"
  createdAt: string
  digest: string        // SHA-256 of backup content
  restoredAt?: string   // populated on successful restore
}
```

### 3.4 Digest-Verified Restore

The restore function (`restoreBackup` in `reliability.ts:56-70`) rejects any
restore where the presented digest does not match the recorded digest:

```
restoreBackup(tenantId, backupId, presentedDigest, store)
  → backup not found        → REJECTED
  → digest mismatch         → REJECTED ("backup digest mismatch")
  → digest matches          → RESTORED, restoredAt timestamp set
```

**Operational consequence:** A corrupt or tampered backup can never be presented
as successfully restored. Always verify backup integrity before declaring a
successful backup.

### 3.5 Restore Drills

A restore drill records the measured RPO/RTO and evaluates them against targets:

```typescript
evaluateDrill(drill, config) → {
  pass: boolean,           // true if both RPO/RTO within target
  violations: string[],    // specific failures
  measuredRpoMs: number,
  measuredRtoMs: number
}
```

**Drill schema:**

```typescript
type DrillRecord = {
  tenantId: string
  drillId: string
  startedAt: string
  finishedAt: string
  restoredDigest: string
  measuredRpoMs: number
  measuredRtoMs: number
}
```

### 3.6 Degraded Enforcement During Outage

During a control-plane outage, nodes follow the D-9 fail-closed policy
(`degradedEnforcementAllowed` in `reliability.ts:103-116`):

| Enforcement State | Behavior |
|-------------------|----------|
| `ONLINE` | Normal operation |
| `OFFLINE_RESTRICTED` | Only `offlineEnabled` grants; no new approvals; no CRITICAL/HIGH effects |
| `OFFLINE_READ_ONLY` | Read-only, non-consequential actions only; fresh policy/revocation leases required |
| `QUARANTINED` | **All effects denied** — node is dead in the water |

---

## 4. Monitoring & Operations

### 4.1 Health Check Endpoints

| Endpoint | File | Response | Purpose |
|----------|------|----------|---------|
| `GET /health` | `server.ts:194-198` | `{ status: "ok", version }` | Daemon health |
| `GET /global/health` | `groups/global.ts:80-87` | `{ healthy: true, version }` | Instance health |
| `GET /api/health` | `packages/server/src/groups/handlers/health.ts:5-7` | `{ healthy: true }` | API health |

### 4.2 Node Status Command

```bash
arcana node status --directory /path/to/workspace [--json]
```

Returns: nodeId, trustDomain, keyEpoch, enrolledAt, policy/revocation sync state, outbox stats (pending/registered/poisoned).

### 4.3 Doctor Diagnostics

```bash
arcana doctor
```

Checks: platform, Bun version, `~/.arcana` home, proxy key, models cache,
proxy catalog, skills cache, license, Ollama detection, engine version.

### 4.4 Daemon Operations

```bash
arcana daemon status   # shows PID, port, workspace, version for all live daemons
arcana daemon stop     # SIGTERM on daemon for current workspace
```

**Daemon characteristics:**
- Auto-starts on first `arcana` call (no manual start)
- Port range: 9142–9150 (scans for first available)
- Idle self-destruct: 5 minutes of inactivity
- Lock files: `~/.arcana/daemon/{sha256(cwd).slice(0,12)}.json`
- Reactive respawn on fetch failure (3-second debounce)

### 4.5 Telemetry & Events

#### Engine Telemetry (F12)

- **File:** `packages/core/src/enterprise/engine-telemetry.ts`
- **Events ingested:** `session.started`, `session.next.step.ended`, `session.next.tool.called`
- **Usage units:** token sums for steps, 1 per session/tool call
- **Design invariant:** Telemetry failures never affect engine flow (swallowed)

#### OpenTelemetry

- **File:** `packages/core/src/observability/otlp.ts`
- **Endpoint:** Controlled by `OTEL_EXPORTER_OTLP_ENDPOINT` env var
- **Exported signals:** traces (`@opentelemetry/exporter-trace-otlp-http`), logs
- **Scope:** Enterprise-only when endpoint is configured

#### Admin Events (F11)

- **File:** `packages/core/src/enterprise/admin-events.ts`
- **Event kinds:** `approval.pending`, `node.revoked`, `policy.promoted`, `alert.critical`
- **Storage:** SQLite (`admin_events` table, tenant-scoped, `(tenant_id, event_key)` primary key)
- **SIEM export:** CEF format (`siem-export.ts`), JSON Lines format available

### 4.6 Anomaly Detection Heuristics

- **File:** `packages/core/src/enterprise/anomaly.ts`
- **Kinds and thresholds:**

| Anomaly | Threshold | Severity |
|---------|-----------|----------|
| `alert_burst` | >= 10 alerts/hour | HIGH |
| `alert_burst` | >= 20 alerts/hour | CRITICAL |
| `revocation_velocity` | >= 5 revocations/hour | HIGH |
| `proof_backlog_growth` | >= 100 proofs backlog | MEDIUM |
| `stale_node_count` | >= 25% nodes stale | MEDIUM |

**Design invariant:** Heuristics are advisory — they never change an authorization
outcome. They feed incident timelines and forensic exports only.

### 4.7 Log Locations

| Log | Location | Format |
|-----|----------|--------|
| Daemon log | `%TEMP%\arcana-daemon.log` (Windows) or `/tmp/arcana-daemon.log` (Linux) | `[ISO8601] message` |
| Effect logs | stderr (if `--print-logs` or `ARCANA_PRINT_LOGS=1`) | structured |
| Log level | `ARCANA_LOG_LEVEL` env var or `--log-level` flag | DEBUG/INFO/WARN/ERROR |

### 4.8 mDNS Service Discovery

- **Library:** `bonjour-service`
- **Service name:** `arcana-{port}` (e.g., `arcana-9142`)
- **Service type:** `http`
- **Default domain:** `arcana.local`
- **Enable:** `--mdns` flag or `config.server.mdns`
- **Constraint:** Only publishes when hostname is NOT loopback

---

## 5. Fail-Closed Operational Defaults

### 5.1 Offline/Partition Policy (D-9)

The offline enforcement state machine (`packages/core/src/crypto/offline-policy.ts`):

```
ONLINE ──[disconnect]──► OFFLINE_RESTRICTED ──[>1hr]──► OFFLINE_READ_ONLY ──[>24hr]──► QUARANTINED
```

| State | Consequential Effects | New Approvals | Policy/Revocation Lease |
|----------------------|-----------------------|---------------|-------------------------|
| `ONLINE` | Allowed (per grant) | Allowed | N/A |
| `OFFLINE_RESTRICTED` | Only `offlineEnabled` grants, <= 1hr | Denied | Must be fresh for consequential |
| `OFFLINE_READ_ONLY` | Denied (read-only) | Denied | Must be fresh for any action |
| `QUARANTINED` | Denied | Denied | Denied |

**Lease defaults:**

| Lease | Duration |
|-------|----------|
| Max offline duration | 24 hours |
| Max consequential offline | 1 hour |
| Policy lease | 1 hour |
| Revocation lease | 30 minutes |
| Lease grace period | 5 minutes |
| Clock skew tolerance | 5 minutes |

**Request classification rule:** The D-7 model exposes one known action
(`filesystem.read` = LOW risk, non-consequential). Every other action id is
**unknown to the model** and therefore classified as CRITICAL + consequential +
approval-required — it will be denied in every offline enforcement mode.
Unknown actions never slip through a partition.

### 5.2 Revocation Store (D-5)

- Sequence-monotonic: strictly increasing per issuer
- Rollback-protected: sequence cannot decrease
- First statement must have sequence exactly 1
- Duplicate sequence with different content is rejected
- Duplicate sequence with same content is idempotent (returns existing)
- SHA-256 digest of signed statement

### 5.3 Node Revocation Consequences

When a node is revoked:

1. Status set to `REVOKED`, `decommissionedAt` timestamp recorded
2. Node key verification fails (status !== `TRUSTED`)
3. Re-enrollment is permanently rejected
4. Revocation statement published to all subscribers via SSE push channel
5. Offline policy denies all effects for the revoked node

### 5.4 Emergency Revocation Push Channel

- **Endpoint:** `GET /api/sync/revocations/stream` (SSE)
- **Mechanism:** Published revocation statements pushed to per-directory subscribers
- **Ordering:** Per-connection sequence maintained
- **Publish + emergency-deny both broadcast**

---

## 6. Command Quick Reference

| Action | Command |
|--------|---------|
| Start headless server | `arcana serve [--port N] [--hostname H] [--mdns]` |
| Start server + web UI | `arcana web` |
| Check health | `curl http://localhost:9142/health` |
| Enroll node | `arcana node enroll --token '...' --key '...' --endpoint '...'` |
| Rotate node key | `arcana node key rotate --endpoint '...'` |
| Node status | `arcana node status [--json]` |
| Proof upload | `arcana node proof upload --endpoint '...'` |
| Sync policy | `arcana node sync policy --endpoint '...' --server-key '...'` |
| Sync revocation | `arcana node sync revocation --endpoint '...' --server-key '...'` |
| Daemon status | `arcana daemon status` |
| Daemon stop | `arcana daemon stop` |
| Doctor check | `arcana doctor` |
| Record backup | `curl -X POST /api/enterprise/organizations/:tid/reliability/backups` |
| Restore backup | `curl -X POST /api/enterprise/organizations/:tid/reliability/backups/:bid/restore` |
| Run DR drill | `curl -X POST /api/enterprise/organizations/:tid/reliability/drills` |

---

## 7. What Is NOT Implemented

| Capability | Status | Tracker |
|-----------|--------|---------|
| TLS/mTLS transport | **NOT implemented** — plain HTTP only | BLK-D-07 |
| OS-level key protection (TPM/Keychain) | **NOT implemented** — secret stored as file (mode 0600) | BLK-D-07 |
| Backup/restore CLI | **NOT implemented** — HTTP API only | this runbook §3 |
| Live Linux workload validation | **NOT exercised** | BLK-D-03 |
| Node 1.0 freeze | **NOT authorized** — TLS/live-Linux/L3 pending | BLK-D-09 |
| Metrics endpoint (/metrics, Prometheus) | **NOT implemented** — OTLP export only | this runbook §4.5 |

---

## 8. Dependencies & References

| Concern | Source File |
|---------|------------|
| Node enrollment logic | `packages/core/src/crypto/node-enrollment.ts` |
| SQLite enrollment registry | `packages/core/src/crypto/node-enrollment-sqlite.ts` |
| Node CLI commands | `packages/engine/src/cli/cmd/node.ts` |
| Node identity file | `packages/engine/src/node/node-identity-file.ts` |
| Offline/partition policy | `packages/core/src/crypto/offline-policy.ts` |
| Revocation store | `packages/core/src/crypto/revocation-store.ts` |
| Reliability (backup/DR) | `packages/core/src/enterprise/reliability.ts` |
| Reliability store | `packages/core/src/enterprise/reliability-sqlite.ts` |
| Engine telemetry | `packages/core/src/enterprise/engine-telemetry.ts` |
| Anomaly heuristics | `packages/core/src/enterprise/anomaly.ts` |
| Admin events | `packages/core/src/enterprise/admin-events.ts` |
| SIEM export | `packages/core/src/enterprise/siem-export.ts` |
| Server entrypoint | `packages/engine/src/server/server.ts` |
| Serve command | `packages/engine/src/cli/cmd/serve.ts` |
| Daemon lifecycle | `packages/engine/src/daemon/lifecycle.ts` |
| OTLP exporter | `packages/core/src/observability/otlp.ts` |
| Blocker register | `docs/BLOCKERS.md` |
