//! E4: Proof-batching parity suite -- pins the Rust port of
//! `packages/core/src/crypto/proof-batching.ts` to golden vectors derived from
//! the TypeScript algorithm.
//!
//! The golden values below were computed by following the TS implementation
//! exactly (SHA-256 over the concatenated hex strings for the Merkle tree;
//! SHA-256 over the exact `JSON.stringify` output -- compact JSON, field
//! insertion order, `previousBatchRoot` serialized as `null` when absent -- for
//! the batch root). The TS fixtures are taken from
//! `packages/core/src/crypto/run-d8a-tests.ts` (`createProof` / `CTX`).
//! `bun` was unavailable in this lane, so the vectors were produced with an
//! independent SHA-256 implementation over the exact TS canonical strings; the
//! coordinator can re-derive them by running the TS module.

use acep_conformance::proof_batch::{
    self, BatchBuildContext, BatchVerificationResult, NodeProofBatchPayload,
    SequencedRunProof, DEFAULT_BATCH_POLICY, PROOF_BATCH_DOMAIN,
};

/// sha256 of the 12-byte ASCII string `empty-merkle` (TS documented constant).
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

fn td_payload(issued_at: &str) -> NodeProofBatchPayload {
    NodeProofBatchPayload {
        schema_version: 1,
        trust_domain: "td".to_string(),
        node_id: "n".to_string(),
        node_key_epoch: 1,
        first_local_sequence: 1,
        last_local_sequence: 2,
        previous_batch_root: None,
        event_merkle_root: "m".to_string(),
        run_proof_hashes: vec!["a".to_string(), "b".to_string()],
        policy_sequence: 1,
        policy_digest: "p".to_string(),
        revocation_sequence: 1,
        revocation_digest: "r".to_string(),
        emergency_epoch: 0,
        issued_at: issued_at.to_string(),
    }
}

#[test]
fn empty_merkle_root_golden() {
    assert_eq!(proof_batch::compute_merkle_root(&[] as &[&str]), EMPTY_MERKLE_ROOT);
    assert_eq!(proof_batch::compute_merkle_root(&[] as &[&str]).len(), 64);
}

#[test]
fn single_hash_golden() {
    assert_eq!(proof_batch::compute_merkle_root(&["abc123"]), "abc123");
}

#[test]
fn two_element_merkle_golden_and_order_sensitivity() {
    let forward = proof_batch::compute_merkle_root(&["aaa", "bbb"]);
    let backward = proof_batch::compute_merkle_root(&["bbb", "aaa"]);
    assert_eq!(forward, "2ce109e9d0faf820b2434e166297934e6177b65ab9951dbc3e204cad4689b39c");
    assert_eq!(backward, "c70153c1f3bc8e770f2153e8f18e0d54cef8c9f48f0e2fda89e7c1d4a2d8a33e");
    assert_ne!(forward, backward);
}

#[test]
fn odd_level_duplicates_last_element_golden() {
    // ["a", "b", "c"] -> sha256(sha256("ab") + sha256("cc")).
    assert_eq!(
        proof_batch::compute_merkle_root(&["a", "b", "c"]),
        "5c700ad7ee9dc104f1a6e92da5a3a76f73d62b0d1c86a205eace21ed914dcdbf"
    );
}

#[test]
fn multi_level_tree_golden() {
    // ["a", "b", "c", "d", "e"] -> level 1: [h(ab), h(cd), h(ee)] ("e"
    // duplicated); level 2: [h(h(ab)+h(cd)), h(h(ee)+h(ee))]; root:
    // sha256(level2[0] + level2[1]).
    assert_eq!(
        proof_batch::compute_merkle_root(&["a", "b", "c", "d", "e"]),
        "3da44b6eb5511a3300965d849e0a2d000e4bf10d9e0afa62c66ebf2b0f04aa04"
    );
}

#[test]
fn merkle_roots_from_d8a_fixtures() {
    assert_eq!(
        proof_batch::compute_merkle_root(&["proof-hash-1", "proof-hash-2", "proof-hash-3"]),
        "6e887e17477b59536648daeac22e0f78ccb019f7691b5af84946b0b61d4d459b"
    );
    assert_eq!(
        proof_batch::compute_merkle_root(&["proof-hash-1", "proof-hash-2"]),
        "257b1c033be7894153adb76cc28ed7abbb3be57b053434cf7a9299dc0fe5d6c5"
    );
    assert_eq!(
        proof_batch::compute_merkle_root(&["proof-hash-4", "proof-hash-5"]),
        "af0fd2a5ac06ab9d8675f10152bb0dec32d016220bb988ae892044756bea5a71"
    );
}

#[test]
fn batch_root_golden_d8a_context() {
    // Build [1..3] with the D-8A CTX fixture; the batch root must match the
    // SHA-256 of the exact TS JSON.stringify output.
    let result = proof_batch::build_proof_batch(
        &[proof(1), proof(2), proof(3)],
        &context(),
        &DEFAULT_BATCH_POLICY,
    );
    assert!(result.is_success());
    assert_eq!(
        result.batch_root().unwrap(),
        "ecd95a627c116f429c5cf272ca6e5a3af81cc1c73273fa740fe3b01f1440d499"
    );
    assert_eq!(
        result.event_merkle_root().unwrap(),
        "6e887e17477b59536648daeac22e0f78ccb019f7691b5af84946b0b61d4d459b"
    );
    // The recomputed root over the built payload is identical.
    assert_eq!(
        proof_batch::compute_batch_root(result.payload().unwrap()),
        result.batch_root().unwrap()
    );
}

#[test]
fn batch_root_golden_with_previous_batch_root() {
    let mut ctx = context();
    ctx.previous_batch_root = Some("prev-batch-root-abc".to_string());
    ctx.last_batch_last_sequence = Some(3);
    let result = proof_batch::build_proof_batch(
        &[proof(4), proof(5)],
        &ctx,
        &DEFAULT_BATCH_POLICY,
    );
    assert!(result.is_success());
    assert_eq!(
        result.batch_root().unwrap(),
        "bc7e7c4bb441e3042836bfefabe59f03d52067456f06dec201e9dbb614b20851"
    );
    assert_eq!(
        result.event_merkle_root().unwrap(),
        "af0fd2a5ac06ab9d8675f10152bb0dec32d016220bb988ae892044756bea5a71"
    );
}

#[test]
fn batch_root_golden_td_payload() {
    let payload = td_payload("2026-07-30T12:00:00.000Z");
    assert_eq!(
        proof_batch::compute_batch_root(&payload),
        "976463b87ea69182da61ed3a33bdd1d0d06e7f40c632992d996c20a003f71442"
    );
}

#[test]
fn batch_root_differs_between_payloads() {
    let p1 = td_payload("");
    let mut p2 = p1.clone();
    p2.event_merkle_root = "m2".to_string();
    assert_ne!(
        proof_batch::compute_batch_root(&p1),
        proof_batch::compute_batch_root(&p2),
        "different payload -> different batch root"
    );
}

#[test]
fn batch_root_is_deterministic_across_builds() {
    let r1 = proof_batch::build_proof_batch(
        &[proof(1), proof(2), proof(3)],
        &context(),
        &DEFAULT_BATCH_POLICY,
    );
    let r2 = proof_batch::build_proof_batch(
        &[proof(3), proof(1), proof(2)],
        &context(),
        &DEFAULT_BATCH_POLICY,
    );
    assert!(r1.is_success() && r2.is_success());
    assert_eq!(r1.batch_root(), r2.batch_root());
    assert_eq!(r1.event_merkle_root(), r2.event_merkle_root());
    assert_eq!(r1.payload().unwrap().first_local_sequence, 1);
}

#[test]
fn build_rejections_match_ts_semantics() {
    assert_eq!(
        proof_batch::build_proof_batch(&[], &context(), &DEFAULT_BATCH_POLICY).reason(),
        Some("no proofs to batch")
    );
    assert_eq!(
        proof_batch::build_proof_batch(&[proof(1), proof(1)], &context(), &DEFAULT_BATCH_POLICY)
            .reason(),
        Some("duplicate local sequence: 1")
    );
    assert_eq!(
        proof_batch::build_proof_batch(&[proof(1), proof(3)], &context(), &DEFAULT_BATCH_POLICY)
            .reason(),
        Some("gap in local sequence: missing 2 in range [1, 3]")
    );
    let mut ctx = context();
    ctx.last_batch_last_sequence = Some(3);
    assert_eq!(
        proof_batch::build_proof_batch(&[proof(5), proof(6)], &ctx, &DEFAULT_BATCH_POLICY)
            .reason(),
        Some("sequence discontinuity: previous batch ended at 3, this batch starts at 5")
    );
}

#[test]
fn verification_matches_ts_semantics() {
    let result = proof_batch::build_proof_batch(
        &[proof(1), proof(2)],
        &context(),
        &DEFAULT_BATCH_POLICY,
    );
    let payload = result.payload().unwrap();
    assert_eq!(
        proof_batch::verify_batch_payload(payload, None),
        BatchVerificationResult::Valid
    );
    assert_eq!(
        proof_batch::verify_batch_root(payload),
        BatchVerificationResult::Valid
    );

    let mut tampered = payload.clone();
    tampered.event_merkle_root = "tampered".to_string();
    let verification = proof_batch::verify_batch_payload(&tampered, None);
    assert!(!verification.is_valid());
    assert_eq!(verification.reason(), Some("event Merkle root mismatch"));

    let mut ctx = context();
    ctx.previous_batch_root = Some("correct".to_string());
    let result = proof_batch::build_proof_batch(&[proof(1)], &ctx, &DEFAULT_BATCH_POLICY);
    let verification =
        proof_batch::verify_batch_payload(result.payload().unwrap(), Some("wrong-previous"));
    assert!(!verification.is_valid());
    assert_eq!(verification.reason(), Some("previous batch root mismatch"));
}

#[test]
fn gap_detection_matches_ts_semantics() {
    let base = td_payload("");
    let mut b1 = base.clone();
    b1.first_local_sequence = 1;
    b1.last_local_sequence = 3;
    b1.run_proof_hashes = vec!["a".to_string(), "b".to_string(), "c".to_string()];
    let mut b2 = b1.clone();
    b2.first_local_sequence = 4;
    b2.last_local_sequence = 6;
    b2.run_proof_hashes = vec!["d".to_string(), "e".to_string(), "f".to_string()];
    b2.previous_batch_root = Some("root1".to_string());

    let no_gaps = proof_batch::detect_batch_gaps(&[b1.clone(), b2.clone()]);
    assert!(!no_gaps.has_gaps);
    assert!(no_gaps.gaps.is_empty());
    assert_eq!(no_gaps.next_expected, 7);

    let mut b3 = b1.clone();
    b3.first_local_sequence = 7;
    b3.last_local_sequence = 9;
    b3.run_proof_hashes = vec!["g".to_string(), "h".to_string(), "i".to_string()];

    let with_gap = proof_batch::detect_batch_gaps(&[b3, b1]);
    assert!(with_gap.has_gaps);
    assert_eq!(with_gap.gaps.len(), 1);
    assert_eq!(with_gap.gaps[0].from, 4);
    assert_eq!(with_gap.gaps[0].to, 6);

    let empty = proof_batch::detect_batch_gaps(&[]);
    assert!(!empty.has_gaps);
    assert_eq!(empty.next_expected, 0);
}

#[test]
fn domain_constant_matches_spec() {
    assert_eq!(PROOF_BATCH_DOMAIN, "arcana:node-proof-batch:v1");
}

#[test]
fn payload_wire_form_matches_ts_shape() {
    let result = proof_batch::build_proof_batch(
        &[proof(1), proof(2)],
        &context(),
        &DEFAULT_BATCH_POLICY,
    );
    let payload = result.payload().unwrap();
    let json = serde_json::to_string(payload).unwrap();
    assert!(json.starts_with("{\"schemaVersion\":1,\"trustDomain\":\"arcana.local\",\"nodeId\":\"node-local-01\""));
    assert!(!json.contains("previousBatchRoot"));

    let back: NodeProofBatchPayload = serde_json::from_str(&json).unwrap();
    assert_eq!(&back, payload);

    // Unknown fields fail closed (deny_unknown_fields).
    let with_evil = json.replacen("\"issuedAt\"", "\"evil\":true,\"issuedAt\"", 1);
    assert!(serde_json::from_str::<NodeProofBatchPayload>(&with_evil).is_err());
}
