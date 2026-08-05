# BLK-D-07 — Topology Exercise Record

**Date:** 2026-08-05
**Worktree:** `L:/tmp/arcana-deploy-runbook` (branch `feat/d7-deploy-runbook`)
**Machine:** Windows 11, Node.js v24.14.1, **Bun NOT installed**

This record documents what was actually exercised during the BLK-D-07 runbook
work, and what could NOT be exercised with explicit reasons. Per the task rules,
no exercise results are invented.

---

## 1. What Was Exercised

### 1.1 Code Verification (complete)

The entire system was read and verified against the runbook claims. Every
command, endpoint, flag, and schema documented in `DEPLOYMENT-RUNBOOK.md` was
traced to its source file:

| Area | Files Read | Verified Claims |
|------|-----------|-----------------|
| Enrollment | `node-enrollment.ts`, `node-enrollment-sqlite.ts`, `enrollment.ts` (routes), `node.ts` (CLI) | Token creation, verification, enrollment flow, HTTP endpoints, CLI flags, identity file persistence |
| Key rotation | `node-enrollment.ts:254-294`, `node.ts:146-217` | Rotation protocol, epoch advancement, rejection conditions |
| Offline policy | `offline-policy.ts` | State machine, lease arithmetic, request classification, enforcement decisions |
| Revocation | `revocation-store.ts` | Sequence monotonicity, rollback protection, digest chaining |
| Backup/DR | `reliability.ts`, `reliability-sqlite.ts`, enterprise handlers | Digest-verified restore, drill evaluation, fail-closed defaults |
| Telemetry | `engine-telemetry.ts`, `otlp.ts` | Event ingestion, OTLP export, no-security-impact invariant |
| Anomaly | `anomaly.ts` | Thresholds, advisory-only design |
| Admin events / SIEM | `admin-events.ts`, `siem-export.ts`, `admin-events-sqlite.ts` | Event kinds, CEF format, persistent store |
| Server / health | `server.ts`, `global.ts`, `health.ts` | Server creation (plain HTTP), health endpoints, mDNS |
| Daemon | `lifecycle.ts`, `activity.ts`, `log.ts` | Port range, idle self-destruct, lock files, log location |

### 1.2 TLS Verification (negative — confirmed NOT implemented)

A comprehensive search confirmed TLS is absent:

- Searched `packages/engine/src/server/server.ts` — only `node:http createServer`, no `node:tls`
- Searched all files for `tls.createServer`, `createSecureContext`, `https.createServer` — zero hits
- Searched for `ARCANA_TLS`, `ARCANA_CERT`, `ARCANA_KEY`, `tlsEnabled` — zero hits
- The only "certificate" references are application-level `NodeIdentityCertificate` (Ed25519, for federation trust) — NOT TLS certificates

**Conclusion:** TLS/mTLS is NOT implemented. Transport is plain HTTP only.

### 1.3 Health Endpoint Verification

The three health endpoints were traced in code:

| Endpoint | File:Line | Response Shape |
|----------|-----------|---------------|
| `GET /health` | `server.ts:194-198` | `{ status: "ok", version }` |
| `GET /global/health` | `groups/global.ts:80-87` | `{ healthy: true, version }` |
| `GET /api/health` | `server/src/groups/handlers/health.ts:5-7` | `{ healthy: true }` |

---

## 2. What Was NOT Exercised

### 2.1 Node Enrollment Ceremony — NOT EXERCISED

**Reason:** `arcana node enroll` requires the Bun runtime (`bun:sqlite`, Bun's
`ed25519` from `@noble/curves`, Bun's `fetch`). Bun is **not installed** on
this machine (Node.js v24.14.1 is available, but the CLI is a Bun-binary
invocation). The command cannot be executed without Bun.

**What would be needed:** A machine with Bun 1.3+ installed, plus a running
control plane (`arcana serve`) to receive the enrollment request.

### 2.2 Key Rotation — NOT EXERCISED

**Reason:** Same as above — `arcana node key rotate` requires Bun runtime and
a live control plane. Cannot be exercised headlessly on this machine.

### 2.3 Backup/Restore Drill — NOT EXERCISED

**Reason:** Backup/restore is accessible only via the HTTP API
(`/api/enterprise/organizations/:tenantId/reliability/*`). Running these
endpoints requires a live `arcana serve` instance with Bun runtime. Bun is
not available on this machine.

### 2.4 Server Startup / Health Check — NOT EXERCISED

**Reason:** `arcana serve` is a Bun-binary command. Cannot start the HTTP
server on this machine without Bun.

### 2.5 Daemon Status / Doctor — NOT EXERCISED

**Reason:** Same — `arcana daemon status` and `arcana doctor` are Bun-binary
commands.

### 2.6 mDNS Discovery — NOT EXERCISED

**Reason:** mDNS publishing requires a running `arcana serve --mdns` instance.
Also, the code (`server.ts:169`) explicitly skips mDNS publish when hostname
is loopback, which is the default. Even with Bun, exercising mDNS would require
a non-loopback bind and a second machine or `avahi`/`dns-sd` listener.

### 2.7 Live Linux Workload Validation — NOT EXERCISED

**Reason:** Tracked separately as BLK-D-03. This machine is Windows; Linux
workload identity validation is explicitly out of scope for BLK-D-07.

### 2.8 TLS/mTLS Handshake — NOT APPLICABLE

**Reason:** TLS is not implemented (see §1.2). Nothing to exercise.

---

## 3. Summary

| Procedure | Exercised | Evidence |
|-----------|-----------|----------|
| Code verification (all runbook claims) | YES | Full source read of 18+ files |
| TLS absence verification | YES | Negative search across codebase |
| Node enrollment (`arcana node enroll`) | NO | Bun runtime not installed on this machine |
| Key rotation (`arcana node key rotate`) | NO | Bun runtime not installed; requires live control plane |
| Backup/restore (HTTP API) | NO | Bun runtime not installed; requires live server |
| Health check (`GET /health`) | NO | Bun runtime not installed; requires live server |
| Daemon status/stop | NO | Bun runtime not installed |
| Doctor diagnostics | NO | Bun runtime not installed |
| mDNS discovery | NO | Requires live server + non-loopback bind |
| Live Linux validation | NO | Tracked as BLK-D-03, separate machine needed |
| TLS handshake | N/A | TLS not implemented in code |

---

## 4. Operational Reality

The node enrollment ceremony and all node/client operations are Bun-binary
commands that cannot be exercised on a machine without Bun. This is an
operational constraint, not a code defect. The runbook documents the correct
procedures; they can be exercised on any machine with Bun 1.3+ and a running
control plane.

**To exercise on a Bun-capable machine:**

```bash
# 1. Start control plane
arcana serve --port 4096

# 2. Enroll a node (in another terminal, different directory)
arcana node enroll \
  --token '<join-token-json>' \
  --key '<base64url-32-byte-ed25519-seed>' \
  --endpoint 'http://localhost:4096' \
  --directory /tmp/node-workspace

# 3. Rotate key
arcana node key rotate --endpoint 'http://localhost:4096' --directory /tmp/node-workspace

# 4. Check status
arcana node status --directory /tmp/node-workspace

# 5. Health check
curl http://localhost:4096/health
```
