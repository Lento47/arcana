# Hardened Linux reference deployment contract

The L4 target is a reproducible hardened Linux deployment, not a development workstation. The assessor evaluates the exact deployment manifest whose SHA-256 is bound into the assurance manifest and L4 attestation.

## Target profile

- Ubuntu Server 24.04 LTS x64 or an assessor-approved equivalent with documented kernel and package versions.
- Dedicated non-login Arcana service identity; no root runtime; restrictive file ownership and `umask`.
- Read-only application files, writable state/log directories separated, and explicit filesystem allowlist.
- `systemd` supervision with restart limits and hardening (`NoNewPrivileges`, private temporary space, protected system/home paths, restricted namespaces, syscall/address-family policy where compatible).
- Default-deny host firewall and outbound allowlist; no public administrative listener.
- TLS 1.3, mutual client/server authentication, rotation/expiry policy, and cryptographic channel binding between authenticated peer identity and Arcana's signed protocol messages.
- Private keys protected by the operating system or hardware-backed keystore; secrets absent from command lines, logs, proof exports, and world-readable files.
- SQLite durability, backup, restore, integrity verification, retention, and disk-capacity alerts exercised under the declared configuration.
- Audit/proof export, time synchronization, health/degraded-state monitoring, and incident evidence retention enabled.
- Direct executor, database, and control-plane bypass paths denied by host and network policy.

## Required evidence

The operator completes a document conforming to `deploy/reference/deployment-manifest.schema.json`. Every control is `verified`, cites one or more immutable evidence artifacts, and binds to the candidate commit. Evidence includes configuration snapshots, permission/firewall inspection, TLS handshake and negative-client tests, channel-binding tests, key rotation, service restart/crash-loop behavior, backup/restore, compromised-node response, proof verification, and bypass attempts.

The deployment manifest contains digests, not secrets. Raw evidence is retained for the assessor and handled according to the engagement's custody rules.

## Current readiness boundary

Arcana does **not** currently satisfy this contract. The repository's blocker register and deployment runbook identify plain HTTP transport without TLS/mTLS or channel binding, missing production OS key protection, and unexecuted live Linux/DR/compromised-node/key-rotation exercises. A conforming `verified` deployment manifest must not be created until those controls are implemented and observed. Consequently, a full-platform passing L4 attestation is currently impossible by design.
