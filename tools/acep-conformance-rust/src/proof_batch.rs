//! E4: Rust proof-batching surface -- deterministic local proof batches.
//!
//! Byte-for-byte port of the TypeScript D-8A proof batching module
//! (`packages/core/src/crypto/proof-batching.ts`):
//!
//!   * serde-serializable batch payload types in the camelCase wire form,
//!     with `#[serde(deny_unknown_fields)]` so unknown payload fields fail
//!     closed;
//!   * `compute_merkle_root`: SHA-256 over the concatenated hex strings
//!     `left + right`, empty input hashing the literal `empty-merkle`, single
//!     input returned unchanged, and odd levels duplicating the last element
//!     (NOT zero padding);
//!   * `compute_batch_root`: SHA-256 over the plain `JSON.stringify` output of
//!     the payload in the exact TS field order (`previousBatchRoot` is always
//!     present, serialized as `null` when absent);
//!   * `build_proof_batch`: deterministic builder with gap / duplicate /
//!     sequence-discontinuity detection mirroring the TS `BatchBuildResult`;
//!   * `verify_batch_payload` / `verify_batch_root`: mirror the TS
//!     `BatchVerificationResult` and `{valid: true} | {valid: false, reason}`
//!     union;
//!   * `detect_batch_gaps`: mirror the TS `GapDetectionResult`.
//!
//! The proof-domain constant `arcana:node-proof-batch:v1` is defined in
//! `proof.rs`; it is re-exported here, not duplicated.
//!
//! Determinism: no builder consults the wall clock. The TS builder falls back
//! to `new Date().toISOString()` when `issuedAt` is omitted; the Rust builder
//! requires `issuedAt` as an explicit input parameter instead.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// Domain Constant

/// Re-export of the spec proof-domain constant defined in `proof.rs`.
pub use crate::proof::DOMAIN_NODE_PROOF_BATCH as PROOF_BATCH_DOMAIN;

// Batch Policy

/// D-8A batch policy limits (mirrors `ProofBatchPolicy`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ProofBatchPolicy {
    pub maximum_events: u64,
    pub maximum_batch_bytes: u64,
    pub maximum_run_proofs: u64,
    pub maximum_batch_age_ms: u64,
}

/// Default policy: 1000 events, 256 KB, 100 run proofs, 5 minutes.
pub const DEFAULT_BATCH_POLICY: ProofBatchPolicy = ProofBatchPolicy {
    maximum_events: 1000,
    maximum_batch_bytes: 256 * 1024,
    maximum_run_proofs: 100,
    maximum_batch_age_ms: 5 * 60 * 1000,
};

// Batch Payload

/// The deterministic node proof batch payload (mirrors `NodeProofBatchPayload`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct NodeProofBatchPayload {
    pub schema_version: u32,
    pub trust_domain: String,
    pub node_id: String,
    pub node_key_epoch: u64,
    pub first_local_sequence: u64,
    pub last_local_sequence: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_batch_root: Option<String>,
    pub event_merkle_root: String,
    pub run_proof_hashes: Vec<String>,
    pub policy_sequence: u64,
    pub policy_digest: String,
    pub revocation_sequence: u64,
    pub revocation_digest: String,
    pub emergency_epoch: u64,
    pub issued_at: String,
}

// Sequenced RunProof

/// A sequence-ordered local RunProof reference (mirrors `SequencedRunProof`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SequencedRunProof {
    pub local_sequence: u64,
    pub run_proof_hash: String,
    pub evidence_hash: String,
    pub trace_health: String,
    pub timestamp: String,
}

// Batch Build Context

/// Deterministic batch build inputs (mirrors the TS `context` argument).
///
/// Unlike the TS context, `issuedAt` is required: the TS builder falls back to
/// `new Date().toISOString()`, which is non-deterministic and intentionally
/// unsupported here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchBuildContext {
    pub trust_domain: String,
    pub node_id: String,
    pub node_key_epoch: u64,
    pub policy_sequence: u64,
    pub policy_digest: String,
    pub revocation_sequence: u64,
    pub revocation_digest: String,
    pub emergency_epoch: u64,
    pub previous_batch_root: Option<String>,
    pub last_batch_last_sequence: Option<u64>,
    pub issued_at: String,
}

// Merkle Tree

/// Compute a Merkle root from an ordered list of hashes.
///
/// Mirrors the TS `computeMerkleRoot` exactly:
///   * empty list -> sha256("empty-merkle") hex;
///   * single hash -> returned unchanged;
///   * every level hashes `left + right` (concatenated hex strings);
///   * odd levels duplicate the last element (NOT zero padding);
///   * deterministic for the same ordered input (order matters).
pub fn compute_merkle_root<S: AsRef<str>>(hashes: &[S]) -> String {
    if hashes.is_empty() {
        return sha256_hex("empty-merkle");
    }

    if hashes.len() == 1 {
        return hashes[0].as_ref().to_string();
    }

    // Build the tree bottom-up.
    let mut level: Vec<String> = hashes.iter().map(|h| h.as_ref().to_string()).collect();

    while level.len() > 1 {
        let mut next: Vec<String> = Vec::with_capacity((level.len() + 1) / 2);
        let mut i = 0;
        while i < level.len() {
            let left = &level[i];
            let right = if i + 1 < level.len() { &level[i + 1] } else { &level[i] }; // duplicate last if odd
            next.push(sha256_hex(&format!("{}{}", left, right)));
            i += 2;
        }
        level = next;
    }

    level[0].clone()
}

// Batch Root

fn json_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}

/// The exact `JSON.stringify` input the TS `computeBatchRoot` hashes: the
/// payload fields in insertion order, with `previousBatchRoot` always present
/// (`null` when absent) and compact JSON (no whitespace).
fn batch_root_input(payload: &NodeProofBatchPayload) -> String {
    let mut s = String::from("{");
    s.push_str(&format!("\"schemaVersion\":{},", payload.schema_version));
    s.push_str(&format!("\"trustDomain\":{},", json_string(&payload.trust_domain)));
    s.push_str(&format!("\"nodeId\":{},", json_string(&payload.node_id)));
    s.push_str(&format!("\"nodeKeyEpoch\":{},", payload.node_key_epoch));
    s.push_str(&format!("\"firstLocalSequence\":{},", payload.first_local_sequence));
    s.push_str(&format!("\"lastLocalSequence\":{},", payload.last_local_sequence));
    match &payload.previous_batch_root {
        Some(previous) => s.push_str(&format!("\"previousBatchRoot\":{},", json_string(previous))),
        None => s.push_str("\"previousBatchRoot\":null,"),
    }
    s.push_str(&format!("\"eventMerkleRoot\":{},", json_string(&payload.event_merkle_root)));
    s.push_str(&format!(
        "\"runProofHashes\":{},",
        serde_json::to_string(&payload.run_proof_hashes).expect("array serialization cannot fail")
    ));
    s.push_str(&format!("\"policySequence\":{},", payload.policy_sequence));
    s.push_str(&format!("\"policyDigest\":{},", json_string(&payload.policy_digest)));
    s.push_str(&format!("\"revocationSequence\":{},", payload.revocation_sequence));
    s.push_str(&format!("\"revocationDigest\":{},", json_string(&payload.revocation_digest)));
    s.push_str(&format!("\"emergencyEpoch\":{},", payload.emergency_epoch));
    s.push_str(&format!("\"issuedAt\":{}", json_string(&payload.issued_at)));
    s.push('}');
    s
}

/// Compute the batch root from the payload: SHA-256 over the plain
/// `JSON.stringify` output (mirrors `computeBatchRoot`).
pub fn compute_batch_root(payload: &NodeProofBatchPayload) -> String {
    sha256_hex(&batch_root_input(payload))
}

// Batch Builder

/// Result of deterministically building a batch (mirrors `BatchBuildResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BatchBuildResult {
    Success {
        payload: NodeProofBatchPayload,
        batch_root: String,
        event_merkle_root: String,
    },
    Failure {
        reason: String,
    },
}

impl BatchBuildResult {
    pub fn is_success(&self) -> bool {
        matches!(self, Self::Success { .. })
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            Self::Failure { reason } => Some(reason),
            _ => None,
        }
    }

    pub fn payload(&self) -> Option<&NodeProofBatchPayload> {
        match self {
            Self::Success { payload, .. } => Some(payload),
            _ => None,
        }
    }

    pub fn batch_root(&self) -> Option<&str> {
        match self {
            Self::Success { batch_root, .. } => Some(batch_root),
            _ => None,
        }
    }

    pub fn event_merkle_root(&self) -> Option<&str> {
        match self {
            Self::Success { event_merkle_root, .. } => Some(event_merkle_root),
            _ => None,
        }
    }
}

/// Deterministically build a batch from an ordered set of sequenced RunProofs.
///
/// Mirrors `buildProofBatch` exactly:
///   * empty input rejected ("no proofs to batch");
///   * inputs sorted by local sequence;
///   * duplicate local sequences rejected;
///   * gaps in the covered sequence range rejected;
///   * continuation from a previous batch enforced when
///     `last_batch_last_sequence` is provided;
///   * policy limit `maximumRunProofs` enforced;
///   * the batch root is computed from the assembled payload.
pub fn build_proof_batch(
    proofs: &[SequencedRunProof],
    context: &BatchBuildContext,
    policy: &ProofBatchPolicy,
) -> BatchBuildResult {
    if proofs.is_empty() {
        return BatchBuildResult::Failure {
            reason: "no proofs to batch".to_string(),
        };
    }

    // Sort by local sequence (deterministic ordering).
    let mut sorted: Vec<&SequencedRunProof> = proofs.iter().collect();
    sorted.sort_by_key(|p| p.local_sequence);

    // Verify no duplicate sequences.
    let mut seen: HashSet<u64> = HashSet::new();
    for p in &sorted {
        if !seen.insert(p.local_sequence) {
            return BatchBuildResult::Failure {
                reason: format!("duplicate local sequence: {}", p.local_sequence),
            };
        }
    }

    // Verify no gaps.
    let first = sorted[0].local_sequence;
    let last = sorted[sorted.len() - 1].local_sequence;
    for seq in first..=last {
        if !seen.contains(&seq) {
            return BatchBuildResult::Failure {
                reason: format!(
                    "gap in local sequence: missing {} in range [{}, {}]",
                    seq, first, last
                ),
            };
        }
    }

    // Verify continuation from previous batch.
    if let Some(last_batch_last_sequence) = context.last_batch_last_sequence {
        if first != last_batch_last_sequence + 1 {
            return BatchBuildResult::Failure {
                reason: format!(
                    "sequence discontinuity: previous batch ended at {}, this batch starts at {}",
                    last_batch_last_sequence, first
                ),
            };
        }
    }

    // Check policy limits.
    if sorted.len() as u64 > policy.maximum_run_proofs {
        return BatchBuildResult::Failure {
            reason: format!("too many proofs: {} > {}", sorted.len(), policy.maximum_run_proofs),
        };
    }

    // Compute the Merkle root from the ordered proof hashes.
    let run_proof_hashes: Vec<String> = sorted
        .iter()
        .map(|p| p.run_proof_hash.clone())
        .collect();
    let event_merkle_root = compute_merkle_root(&run_proof_hashes);

    let payload = NodeProofBatchPayload {
        schema_version: 1,
        trust_domain: context.trust_domain.clone(),
        node_id: context.node_id.clone(),
        node_key_epoch: context.node_key_epoch,
        first_local_sequence: first,
        last_local_sequence: last,
        previous_batch_root: context.previous_batch_root.clone(),
        event_merkle_root: event_merkle_root.clone(),
        run_proof_hashes,
        policy_sequence: context.policy_sequence,
        policy_digest: context.policy_digest.clone(),
        revocation_sequence: context.revocation_sequence,
        revocation_digest: context.revocation_digest.clone(),
        emergency_epoch: context.emergency_epoch,
        issued_at: context.issued_at.clone(),
    };

    let batch_root = compute_batch_root(&payload);

    BatchBuildResult::Success {
        payload,
        batch_root,
        event_merkle_root,
    }
}

// Verification

/// Result of verifying a batch payload (mirrors `BatchVerificationResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BatchVerificationResult {
    Valid,
    Invalid {
        reason: String,
    },
}

impl BatchVerificationResult {
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid)
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            Self::Invalid { reason } => Some(reason),
            _ => None,
        }
    }
}

/// Verify a batch payload is internally consistent.
///
/// Mirrors `verifyBatchPayload` exactly: schema version, sequence ordering,
/// non-empty hash list, proof count vs. range, Merkle root recomputation, and
/// optional previous-batch linkage.
pub fn verify_batch_payload(
    payload: &NodeProofBatchPayload,
    expected_previous_batch_root: Option<&str>,
) -> BatchVerificationResult {
    if payload.schema_version != 1 {
        return BatchVerificationResult::Invalid {
            reason: format!("unsupported schema version: {}", payload.schema_version),
        };
    }

    if payload.first_local_sequence > payload.last_local_sequence {
        return BatchVerificationResult::Invalid {
            reason: format!(
                "first sequence {} > last {}",
                payload.first_local_sequence, payload.last_local_sequence
            ),
        };
    }

    if payload.run_proof_hashes.is_empty() {
        return BatchVerificationResult::Invalid {
            reason: "no run proof hashes".to_string(),
        };
    }

    let expected_count = payload.last_local_sequence - payload.first_local_sequence + 1;
    if payload.run_proof_hashes.len() as u64 != expected_count {
        return BatchVerificationResult::Invalid {
            reason: format!(
                "proof count mismatch: {} hashes for range [{}, {}] (expected {})",
                payload.run_proof_hashes.len(),
                payload.first_local_sequence,
                payload.last_local_sequence,
                expected_count
            ),
        };
    }

    // Verify the Merkle root.
    let computed_merkle = compute_merkle_root(&payload.run_proof_hashes);
    if computed_merkle != payload.event_merkle_root {
        return BatchVerificationResult::Invalid {
            reason: "event Merkle root mismatch".to_string(),
        };
    }

    // Verify previous batch linkage.
    if let Some(expected) = expected_previous_batch_root {
        if payload.previous_batch_root.as_deref() != Some(expected) {
            return BatchVerificationResult::Invalid {
                reason: "previous batch root mismatch".to_string(),
            };
        }
    }

    BatchVerificationResult::Valid
}

/// Recompute the batch root (deterministic) and report validity.
///
/// Mirrors `verifyBatchRoot`: the recomputation itself is always valid; the
/// caller compares the recomputed root against the expected root separately.
pub fn verify_batch_root(payload: &NodeProofBatchPayload) -> BatchVerificationResult {
    let _computed_root = compute_batch_root(payload);
    BatchVerificationResult::Valid
}

// Gap Detection

/// A missing contiguous sequence range (mirrors `{ from: number; to: number }`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SequenceGap {
    pub from: u64,
    pub to: u64,
}

/// Result of detecting gaps between consecutive batches (mirrors
/// `GapDetectionResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapDetectionResult {
    pub has_gaps: bool,
    pub gaps: Vec<SequenceGap>,
    pub next_expected: u64,
}

/// Detect gaps between consecutive batches, sorted by first sequence.
pub fn detect_batch_gaps(batches: &[NodeProofBatchPayload]) -> GapDetectionResult {
    if batches.is_empty() {
        return GapDetectionResult {
            has_gaps: false,
            gaps: Vec::new(),
            next_expected: 0,
        };
    }

    // Sort by first sequence.
    let mut sorted: Vec<&NodeProofBatchPayload> = batches.iter().collect();
    sorted.sort_by_key(|b| b.first_local_sequence);

    let mut gaps: Vec<SequenceGap> = Vec::new();

    for i in 1..sorted.len() {
        let prev = sorted[i - 1];
        let curr = sorted[i];

        if curr.first_local_sequence > prev.last_local_sequence + 1 {
            gaps.push(SequenceGap {
                from: prev.last_local_sequence + 1,
                to: curr.first_local_sequence - 1,
            });
        }
    }

    let next_expected = sorted[sorted.len() - 1].last_local_sequence + 1;

    GapDetectionResult {
        has_gaps: !gaps.is_empty(),
        gaps,
        next_expected,
    }
}

// Helpers

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proof::DOMAIN_NODE_PROOF_BATCH;

    /// sha256 of the 12-byte ASCII string `empty-merkle` (TS golden value).
    const EMPTY_MERKLE_ROOT: &str =
        "cf832550214978fdc85f520f44a2b15da860d382773f9cea850c60d424f14a06";

    fn proof(seq: u64) -> SequencedRunProof {
        SequencedRunProof {
            local_sequence: seq,
            run_proof_hash: format!("proof-hash-{}", seq),
            evidence_hash: format!("evidence-{}", seq),
            trace_health: "COMPLETE".to_string(),
            timestamp: format!("2026-07-30T12:{:02}:00.000Z", seq),
        }
    }

    fn context() -> BatchBuildContext {
        BatchBuildContext {
            trust_domain: "arcana.local".to_string(),
            node_id: "node-local-01".to_string(),
            node_key_epoch: 1,
            policy_sequence: 5,
            policy_digest: "pd-abc".to_string(),
            revocation_sequence: 3,
            revocation_digest: "rd-xyz".to_string(),
            emergency_epoch: 0,
            previous_batch_root: None,
            last_batch_last_sequence: None,
            issued_at: "2026-07-30T12:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn empty_merkle_root_is_sha256_of_empty_merkle() {
        assert_eq!(compute_merkle_root(&[] as &[&str]), EMPTY_MERKLE_ROOT);
        assert_eq!(compute_merkle_root(&[] as &[&str]).len(), 64);
        assert_eq!(
            compute_merkle_root(&[] as &[&str]),
            compute_merkle_root(&[] as &[&str]),
            "empty Merkle root is deterministic"
        );
    }

    #[test]
    fn single_hash_is_returned_unchanged() {
        assert_eq!(compute_merkle_root(&["abc123"]), "abc123");
    }

    #[test]
    fn merkle_order_matters() {
        let forward = compute_merkle_root(&["aaa", "bbb"]);
        let backward = compute_merkle_root(&["bbb", "aaa"]);
        assert_eq!(forward.len(), 64);
        assert_ne!(forward, backward, "order matters for Merkle root");
        assert_eq!(forward, "2ce109e9d0faf820b2434e166297934e6177b65ab9951dbc3e204cad4689b39c");
        assert_eq!(backward, "c70153c1f3bc8e770f2153e8f18e0d54cef8c9f48f0e2fda89e7c1d4a2d8a33e");
    }

    #[test]
    fn odd_level_duplicates_last_element() {
        // ["a", "b", "c"] -> sha256(sha256("ab") + sha256("cc")).
        let root = compute_merkle_root(&["a", "b", "c"]);
        assert_eq!(root.len(), 64);
        assert_eq!(root, "5c700ad7ee9dc104f1a6e92da5a3a76f73d62b0d1c86a205eace21ed914dcdbf");
    }

    #[test]
    fn multi_level_tree_is_deterministic() {
        let hashes = ["a", "b", "c", "d", "e"];
        let r1 = compute_merkle_root(&hashes);
        let r2 = compute_merkle_root(&hashes);
        assert_eq!(r1, r2, "same input -> same Merkle root");
        assert_eq!(r1, "3da44b6eb5511a3300965d849e0a2d000e4bf10d9e0afa62c66ebf2b0f04aa04");
    }

    #[test]
    fn batch_root_is_deterministic() {
        let result = build_proof_batch(
            &[proof(1), proof(2), proof(3)],
            &context(),
            &DEFAULT_BATCH_POLICY,
        );
        let payload = result.payload().expect("build must succeed");
        let r1 = compute_batch_root(payload);
        let r2 = compute_batch_root(payload);
        assert_eq!(r1, r2, "same payload -> same root");
        assert_eq!(r1.len(), 64);
    }

    #[test]
    fn batch_root_input_matches_ts_json_stringify_exactly() {
        let result = build_proof_batch(
            &[proof(1), proof(2), proof(3)],
            &context(),
            &DEFAULT_BATCH_POLICY,
        );
        let payload = result.payload().expect("build must succeed");
        // Pinned against the TS JSON.stringify output for the D-8A fixture
        // (field insertion order, previousBatchRoot always present as null).
        assert_eq!(
            batch_root_input(payload),
            "{\"schemaVersion\":1,\"trustDomain\":\"arcana.local\",\"nodeId\":\"node-local-01\",\"nodeKeyEpoch\":1,\"firstLocalSequence\":1,\"lastLocalSequence\":3,\"previousBatchRoot\":null,\"eventMerkleRoot\":\"6e887e17477b59536648daeac22e0f78ccb019f7691b5af84946b0b61d4d459b\",\"runProofHashes\":[\"proof-hash-1\",\"proof-hash-2\",\"proof-hash-3\"],\"policySequence\":5,\"policyDigest\":\"pd-abc\",\"revocationSequence\":3,\"revocationDigest\":\"rd-xyz\",\"emergencyEpoch\":0,\"issuedAt\":\"2026-07-30T12:00:00.000Z\"}"
        );
    }

    #[test]
    fn build_batch_valid_sequence() {
        let result = build_proof_batch(
            &[proof(1), proof(2), proof(3)],
            &context(),
            &DEFAULT_BATCH_POLICY,
        );
        assert!(result.is_success());
        let payload = result.payload().unwrap();
        assert_eq!(payload.first_local_sequence, 1);
        assert_eq!(payload.last_local_sequence, 3);
        assert_eq!(payload.run_proof_hashes, vec!["proof-hash-1", "proof-hash-2", "proof-hash-3"]);
        assert_eq!(payload.trust_domain, "arcana.local");
        assert_eq!(payload.node_id, "node-local-01");
        assert_eq!(payload.policy_sequence, 5);
        assert_eq!(result.event_merkle_root().unwrap(), "6e887e17477b59536648daeac22e0f78ccb019f7691b5af84946b0b61d4d459b");
        assert_eq!(result.batch_root().unwrap(), "ecd95a627c116f429c5cf272ca6e5a3af81cc1c73273fa740fe3b01f1440d499");
        assert_eq!(result.batch_root().unwrap().len(), 64);
    }

    #[test]
    fn build_batch_rejects_empty_input() {
        let result = build_proof_batch(&[], &context(), &DEFAULT_BATCH_POLICY);
        assert!(!result.is_success());
        assert_eq!(result.reason(), Some("no proofs to batch"));
    }

    #[test]
    fn build_batch_rejects_duplicate_sequence() {
        let result = build_proof_batch(&[proof(1), proof(1)], &context(), &DEFAULT_BATCH_POLICY);
        assert!(!result.is_success());
        assert_eq!(result.reason(), Some("duplicate local sequence: 1"));
    }

    #[test]
    fn build_batch_rejects_gap() {
        let result = build_proof_batch(&[proof(1), proof(3)], &context(), &DEFAULT_BATCH_POLICY);
        assert!(!result.is_success());
        assert_eq!(
            result.reason(),
            Some("gap in local sequence: missing 2 in range [1, 3]")
        );
    }

    #[test]
    fn build_batch_rejects_too_many_proofs() {
        let policy = ProofBatchPolicy {
            maximum_events: 1000,
            maximum_batch_bytes: 256 * 1024,
            maximum_run_proofs: 2,
            maximum_batch_age_ms: 5 * 60 * 1000,
        };
        let result = build_proof_batch(
            &[proof(1), proof(2), proof(3)],
            &context(),
            &policy,
        );
        assert!(!result.is_success());
        assert_eq!(result.reason(), Some("too many proofs: 3 > 2"));
    }

    #[test]
    fn build_batch_rejects_sequence_discontinuity() {
        let mut ctx = context();
        ctx.last_batch_last_sequence = Some(3);
        let result = build_proof_batch(&[proof(5), proof(6)], &ctx, &DEFAULT_BATCH_POLICY);
        assert!(!result.is_success());
        assert_eq!(
            result.reason(),
            Some("sequence discontinuity: previous batch ended at 3, this batch starts at 5")
        );
    }

    #[test]
    fn build_batch_continuation_from_previous_batch() {
        let mut ctx = context();
        ctx.previous_batch_root = Some("prev-batch-root-abc".to_string());
        ctx.last_batch_last_sequence = Some(3);
        let result = build_proof_batch(&[proof(4), proof(5)], &ctx, &DEFAULT_BATCH_POLICY);
        assert!(result.is_success(), "continuation must build: {:?}", result.reason());
        let payload = result.payload().unwrap();
        assert_eq!(payload.previous_batch_root.as_deref(), Some("prev-batch-root-abc"));
        assert_eq!(payload.first_local_sequence, 4);
        assert_eq!(result.batch_root().unwrap(), "bc7e7c4bb441e3042836bfefabe59f03d52067456f06dec201e9dbb614b20851");
    }

    #[test]
    fn build_batch_is_insensitive_to_input_order() {
        let sorted = [proof(1), proof(2), proof(3)];
        let unsorted = [proof(3), proof(1), proof(2)];
        let r1 = build_proof_batch(&sorted, &context(), &DEFAULT_BATCH_POLICY);
        let r2 = build_proof_batch(&unsorted, &context(), &DEFAULT_BATCH_POLICY);
        assert!(r1.is_success() && r2.is_success());
        assert_eq!(r1.batch_root(), r2.batch_root(), "unsorted -> same batch root");
        assert_eq!(r1.payload().unwrap().first_local_sequence, 1);
    }

    #[test]
    fn verify_valid_payload_passes() {
        let result = build_proof_batch(&[proof(1), proof(2)], &context(), &DEFAULT_BATCH_POLICY);
        let payload = result.payload().unwrap();
        assert_eq!(verify_batch_payload(payload, None), BatchVerificationResult::Valid);
        assert!(verify_batch_payload(payload, None).is_valid());
    }

    #[test]
    fn verify_detects_merkle_root_mismatch() {
        let result = build_proof_batch(&[proof(1), proof(2)], &context(), &DEFAULT_BATCH_POLICY);
        let mut payload = result.payload().unwrap().clone();
        payload.event_merkle_root = "tampered".to_string();
        let verification = verify_batch_payload(&payload, None);
        assert!(!verification.is_valid());
        assert_eq!(verification.reason(), Some("event Merkle root mismatch"));
    }

    #[test]
    fn verify_detects_proof_count_mismatch() {
        let result = build_proof_batch(&[proof(1), proof(2), proof(3)], &context(), &DEFAULT_BATCH_POLICY);
        let mut payload = result.payload().unwrap().clone();
        payload.run_proof_hashes = vec!["a".to_string(), "b".to_string()];
        let verification = verify_batch_payload(&payload, None);
        assert!(!verification.is_valid());
        assert_eq!(
            verification.reason(),
            Some("proof count mismatch: 2 hashes for range [1, 3] (expected 3)")
        );
    }

    #[test]
    fn verify_detects_previous_batch_root_mismatch() {
        let mut ctx = context();
        ctx.previous_batch_root = Some("correct".to_string());
        let result = build_proof_batch(&[proof(1)], &ctx, &DEFAULT_BATCH_POLICY);
        let payload = result.payload().unwrap();
        let verification = verify_batch_payload(payload, Some("wrong-previous"));
        assert!(!verification.is_valid());
        assert_eq!(verification.reason(), Some("previous batch root mismatch"));
    }

    #[test]
    fn verify_rejects_inverted_sequence_range() {
        let result = build_proof_batch(&[proof(1), proof(2)], &context(), &DEFAULT_BATCH_POLICY);
        let mut payload = result.payload().unwrap().clone();
        payload.first_local_sequence = 2;
        payload.last_local_sequence = 1;
        let verification = verify_batch_payload(&payload, None);
        assert!(!verification.is_valid());
        assert_eq!(verification.reason(), Some("first sequence 2 > last 1"));
    }

    #[test]
    fn verify_rejects_unsupported_schema_version() {
        let result = build_proof_batch(&[proof(1)], &context(), &DEFAULT_BATCH_POLICY);
        let mut payload = result.payload().unwrap().clone();
        payload.schema_version = 2;
        let verification = verify_batch_payload(&payload, None);
        assert!(!verification.is_valid());
        assert_eq!(verification.reason(), Some("unsupported schema version: 2"));
    }

    #[test]
    fn verify_rejects_empty_hash_list() {
        let result = build_proof_batch(&[proof(1)], &context(), &DEFAULT_BATCH_POLICY);
        let mut payload = result.payload().unwrap().clone();
        payload.run_proof_hashes.clear();
        let verification = verify_batch_payload(&payload, None);
        assert!(!verification.is_valid());
        assert_eq!(verification.reason(), Some("no run proof hashes"));
    }

    #[test]
    fn verify_batch_root_always_valid() {
        let result = build_proof_batch(&[proof(1), proof(2)], &context(), &DEFAULT_BATCH_POLICY);
        let payload = result.payload().unwrap();
        assert_eq!(verify_batch_root(payload), BatchVerificationResult::Valid);
    }

    #[test]
    fn gap_detection_empty_batches() {
        let result = detect_batch_gaps(&[]);
        assert!(!result.has_gaps);
        assert!(result.gaps.is_empty());
        assert_eq!(result.next_expected, 0);
    }

    #[test]
    fn gap_detection_no_gaps() {
        let batch1 = NodeProofBatchPayload {
            schema_version: 1,
            trust_domain: "td".to_string(),
            node_id: "n".to_string(),
            node_key_epoch: 1,
            first_local_sequence: 1,
            last_local_sequence: 3,
            previous_batch_root: None,
            event_merkle_root: "m".to_string(),
            run_proof_hashes: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            policy_sequence: 1,
            policy_digest: "p".to_string(),
            revocation_sequence: 1,
            revocation_digest: "r".to_string(),
            emergency_epoch: 0,
            issued_at: String::new(),
        };
        let mut batch2 = batch1.clone();
        batch2.first_local_sequence = 4;
        batch2.last_local_sequence = 6;
        batch2.run_proof_hashes = vec!["d".to_string(), "e".to_string(), "f".to_string()];
        batch2.previous_batch_root = Some("root1".to_string());

        let result = detect_batch_gaps(&[batch1, batch2]);
        assert!(!result.has_gaps);
        assert!(result.gaps.is_empty());
        assert_eq!(result.next_expected, 7);
    }

    #[test]
    fn gap_detection_finds_gap() {
        let base = NodeProofBatchPayload {
            schema_version: 1,
            trust_domain: "td".to_string(),
            node_id: "n".to_string(),
            node_key_epoch: 1,
            first_local_sequence: 1,
            last_local_sequence: 3,
            previous_batch_root: None,
            event_merkle_root: "m".to_string(),
            run_proof_hashes: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            policy_sequence: 1,
            policy_digest: "p".to_string(),
            revocation_sequence: 1,
            revocation_digest: "r".to_string(),
            emergency_epoch: 0,
            issued_at: String::new(),
        };
        let mut batch2 = base.clone();
        batch2.first_local_sequence = 7;
        batch2.last_local_sequence = 9;
        batch2.run_proof_hashes = vec!["g".to_string(), "h".to_string(), "i".to_string()];

        // Input order must not matter: batches are sorted by first sequence.
        let result = detect_batch_gaps(&[batch2, base]);
        assert!(result.has_gaps);
        assert_eq!(result.gaps.len(), 1);
        assert_eq!(result.gaps[0].from, 4);
        assert_eq!(result.gaps[0].to, 6);
    }

    #[test]
    fn domain_constant_is_reused_not_duplicated() {
        assert_eq!(PROOF_BATCH_DOMAIN, "arcana:node-proof-batch:v1");
        assert_eq!(PROOF_BATCH_DOMAIN, DOMAIN_NODE_PROOF_BATCH);
    }

    #[test]
    fn payload_json_round_trip() {
        let result = build_proof_batch(&[proof(1), proof(2)], &context(), &DEFAULT_BATCH_POLICY);
        let payload = result.payload().unwrap();
        let json = serde_json::to_string(payload).unwrap();
        assert!(!json.contains("previousBatchRoot"));
        let back: NodeProofBatchPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, payload);

        let with_null = json.replacen("\"issuedAt\"", "\"previousBatchRoot\":null,\"issuedAt\"", 1);
        let parsed: NodeProofBatchPayload = serde_json::from_str(&with_null).unwrap();
        assert_eq!(parsed.previous_batch_root, None);

        let with_root = json.replacen("\"issuedAt\"", "\"previousBatchRoot\":\"root-x\",\"issuedAt\"", 1);
        let parsed: NodeProofBatchPayload = serde_json::from_str(&with_root).unwrap();
        assert_eq!(parsed.previous_batch_root.as_deref(), Some("root-x"));
    }

    #[test]
    fn payload_rejects_unknown_fields() {
        let result = build_proof_batch(&[proof(1)], &context(), &DEFAULT_BATCH_POLICY);
        let json = serde_json::to_string(result.payload().unwrap()).unwrap();
        let with_evil = json.replacen("\"issuedAt\"", "\"evil\":1,\"issuedAt\"", 1);
        let parsed: Result<NodeProofBatchPayload, _> = serde_json::from_str(&with_evil);
        assert!(parsed.is_err(), "unknown payload fields must fail closed");
    }
}
