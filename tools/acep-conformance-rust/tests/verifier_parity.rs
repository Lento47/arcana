//! E4-B: Verifier parity suite — mirrors `verifier.ts` against the flat
//! TS-model envelope JSON (NOT the internal snake_case wire structs).
//!
//! Every negative fixture must fail closed: wrong domain, tampered body,
//! wrong key, unknown issuer, wrong audience, expired, sequence rollback,
//! unknown field, and duplicate keys.

use acep_conformance::canonical;
use acep_conformance::strict_json::parse_strict_envelope;
use acep_conformance::verifier::{
    self, RejectionReason, VerificationResult, VerificationStage,
    CAPABILITY_DOMAIN, NODE_IDENTITY_DOMAIN, POLICY_DOMAIN, REVOCATION_DOMAIN,
};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};
use std::collections::HashMap;

// 2025-08-05T00:00:00.000Z — inside every positive fixture's expiresAt window.
const NOW_MS: u64 = 1754380800000;

fn fixture_key() -> SigningKey {
    let mut seed = [0u8; 32];
    seed[0] = 0x42;
    SigningKey::from_bytes(&seed)
}

fn other_key() -> SigningKey {
    let mut seed = [0u8; 32];
    seed[0] = 0x99;
    SigningKey::from_bytes(&seed)
}

fn trusted_keys() -> HashMap<String, [u8; 32]> {
    let mut m = HashMap::new();
    m.insert("issuer-alpha".to_string(), fixture_key().verifying_key().to_bytes());
    m
}

/// Sign a flat TS-model envelope: the input is UTF8(domain) ||
/// canonical(unsigned payload) where the unsigned payload excludes `signature`
/// and `signatureAlgorithm` — exactly like `verifier.ts` verifies.
fn sign_flat(payload: Value, domain: &str, signing_key: &SigningKey) -> Value {
    let unsigned = canonical::unsigned_payload(&payload);
    let sig_input = canonical::build_signature_input(domain, &unsigned);
    let sig_bytes = signing_key.sign(&sig_input);
    let sig_b64 = canonical::encode_base64url(&sig_bytes.to_bytes());
    let mut envelope = payload;
    if let Value::Object(map) = &mut envelope {
        map.insert("signature".to_string(), Value::String(sig_b64));
    }
    envelope
}

fn capability_payload() -> Value {
    json!({
        "schemaVersion": 1,
        "issuerId": "issuer-alpha",
        "issuerEpoch": 1,
        "audienceNodeId": "node-beta",
        "grant": {
            "grantId": "grant-001",
            "principal": { "kind": "agent", "id": "arcana" },
            "actions": ["filesystem.read"],
            "resources": ["packages/**"],
            "workspaceId": "workspace-1",
            "contractId": "contract-001",
            "contractRevision": 1,
            "maxUses": 10,
            "delegationDepth": 0
        },
        "issuedAt": "2026-08-05T00:00:00.000Z",
        "expiresAt": "2099-12-31T23:59:59.999Z",
        "nonce": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "signatureAlgorithm": "Ed25519"
    })
}

fn policy_payload() -> Value {
    json!({
        "schemaVersion": 1,
        "issuerId": "issuer-alpha",
        "issuerEpoch": 1,
        "sequence": 1,
        "policyId": "policy-001",
        "policyVersion": "1.0.0",
        "policyDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "previousPolicyDigest": "d1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0011",
        "issuedAt": "2026-08-05T00:00:00.000Z",
        "expiresAt": "2099-12-31T23:59:59.999Z",
        "signatureAlgorithm": "Ed25519"
    })
}

fn node_identity_payload() -> Value {
    json!({
        "schemaVersion": 1,
        "nodeId": "node-beta",
        "organizationId": "arcana-org",
        "publicKey": "TLWr9q15-_WrvMr8wmnYXNJlHtS4hbWGnyQa7fCluik",
        "issuerId": "issuer-alpha",
        "issuerEpoch": 1,
        "issuedAt": "2026-08-05T00:00:00.000Z",
        "expiresAt": "2099-12-31T23:59:59.999Z",
        "capabilities": ["filesystem.read"],
        "signatureAlgorithm": "Ed25519"
    })
}

fn revocation_payload() -> Value {
    json!({
        "schemaVersion": 1,
        "issuerId": "issuer-alpha",
        "issuerEpoch": 1,
        "sequence": 1,
        "subjectType": "GRANT",
        "subjectId": "grant-001",
        "reason": "compromised_key",
        "effectiveAt": "2026-08-05T00:00:00.000Z",
        "issuedAt": "2026-08-05T00:00:00.000Z",
        "signatureAlgorithm": "Ed25519"
    })
}

fn capability_options<'a>() -> verifier::VerifyOptions<'a> {
    verifier::VerifyOptions {
        now_ms: NOW_MS,
        expected_audience: Some("node-beta"),
        known_sequences: None,
    }
}

fn assert_rejected_stage(result: &VerificationResult, stage: VerificationStage) {
    assert!(
        !result.is_valid(),
        "expected rejection at {:?}, but got valid",
        stage
    );
    assert_eq!(
        result.stage(),
        Some(&stage),
        "expected stage {:?}, got {:?}",
        stage,
        result
    );
}

#[test]
fn capability_envelope_valid() {
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert!(r.is_valid(), "valid capability should pass: {:?}", r);
}

#[test]
fn policy_envelope_valid() {
    let envelope = sign_flat(policy_payload(), POLICY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_policy(&envelope, &trusted_keys(), &HashMap::new(), NOW_MS);
    assert!(r.is_valid(), "valid policy should pass: {:?}", r);
}

#[test]
fn node_identity_valid() {
    let cert = sign_flat(node_identity_payload(), NODE_IDENTITY_DOMAIN, &fixture_key());
    let r = verifier::verify_node_identity(&cert, &trusted_keys(), NOW_MS);
    assert!(r.is_valid(), "valid node identity should pass: {:?}", r);
}

#[test]
fn revocation_statement_valid() {
    let stmt = sign_flat(revocation_payload(), REVOCATION_DOMAIN, &fixture_key());
    let r = verifier::verify_revocation_statement(&stmt, &trusted_keys(), &HashMap::new(), NOW_MS);
    assert!(r.is_valid(), "valid revocation should pass: {:?}", r);
}

#[test]
fn capability_max_uses_unlimited_accepted() {
    // The TS grant model allows maxUses: number | "unlimited". The flat JSON
    // must accept the string form at schema layer (no numeric coercion).
    let mut payload = capability_payload();
    payload["grant"]["maxUses"] = json!("unlimited");
    let envelope = sign_flat(payload, CAPABILITY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert!(r.is_valid(), "maxUses=unlimited should pass schema: {:?}", r);
}

#[test]
fn wrong_domain_signature_rejected() {
    // A capability payload signed under the POLICY domain. Schema passes as a
    // capability, but the signature input domain differs → SIGNATURE reject.
    let envelope = sign_flat(capability_payload(), POLICY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Signature);
    assert_eq!(r.reason(), Some(&RejectionReason::InvalidSignature));
}

#[test]
fn tampered_body_rejected() {
    let mut envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    envelope["grant"]["grantId"] = json!("grant-999");
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Signature);
}

#[test]
fn wrong_key_rejected() {
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let mut wrong = HashMap::new();
    wrong.insert("issuer-alpha".to_string(), other_key().verifying_key().to_bytes());
    let r = verifier::verify_signed_capability(&envelope, &wrong, &capability_options());
    assert_rejected_stage(&r, VerificationStage::Signature);
}

#[test]
fn unknown_issuer_rejected() {
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &HashMap::new(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Trust);
    assert_eq!(r.reason(), Some(&RejectionReason::UnknownIssuer));
}

#[test]
fn wrong_audience_rejected() {
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let opts = verifier::VerifyOptions {
        now_ms: NOW_MS,
        expected_audience: Some("node-gamma"),
        known_sequences: None,
    };
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &opts);
    assert_rejected_stage(&r, VerificationStage::Audience);
    assert_eq!(r.reason(), Some(&RejectionReason::WrongAudience));
}

#[test]
fn expired_rejected() {
    let mut payload = capability_payload();
    payload["expiresAt"] = json!("2020-01-01T00:00:00.000Z");
    let envelope = sign_flat(payload, CAPABILITY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Freshness);
    assert_eq!(r.reason(), Some(&RejectionReason::Expired));
}

#[test]
fn sequence_rollback_rejected() {
    let stmt = sign_flat(revocation_payload(), REVOCATION_DOMAIN, &fixture_key());
    let mut known = HashMap::new();
    known.insert("issuer-alpha".to_string(), 1u64);
    let r = verifier::verify_revocation_statement(&stmt, &trusted_keys(), &known, NOW_MS);
    assert_rejected_stage(&r, VerificationStage::Revocation);
    assert_eq!(r.reason(), Some(&RejectionReason::SequenceRollback));
}

#[test]
fn unknown_field_rejected() {
    let mut envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    envelope["evil"] = json!("nope");
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Schema);
    assert_eq!(r.reason(), Some(&RejectionReason::SchemaUnsupported));
}

#[test]
fn missing_required_field_rejected() {
    let mut payload = capability_payload();
    payload.as_object_mut().unwrap().remove("nonce");
    let envelope = sign_flat(payload, CAPABILITY_DOMAIN, &fixture_key());
    let r = verifier::verify_signed_capability(&envelope, &trusted_keys(), &capability_options());
    assert_rejected_stage(&r, VerificationStage::Schema);
}

#[test]
fn duplicate_json_keys_rejected() {
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let json = serde_json::to_string(&envelope).unwrap();
    let dup = json.replacen("\"issuerEpoch\":1", "\"issuerEpoch\":1,\"issuerEpoch\":1", 1);
    let err = parse_strict_envelope(&dup);
    assert!(err.is_err(), "duplicate keys must be rejected at PARSE");
}

#[test]
fn full_wire_round_trip_verifies() {
    // Serialize to flat TS-model JSON, strictly parse it back, then verify.
    let envelope = sign_flat(capability_payload(), CAPABILITY_DOMAIN, &fixture_key());
    let json = serde_json::to_string(&envelope).unwrap();
    let parsed = parse_strict_envelope(&json).unwrap();
    let r = verifier::verify_signed_capability(&parsed, &trusted_keys(), &capability_options());
    assert!(r.is_valid(), "wire round-trip should verify: {:?}", r);
}
