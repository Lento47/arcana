//! E4-B: Rust proof surface — RunProof model, signing, and verification.
//!
//! Byte-for-byte port of the TypeScript DistributedRunProof model
//! (`packages/core/src/crypto/runproof.ts`):
//!
//!   * serde-serializable RunProof types in the camelCase wire form, with
//!     `#[serde(deny_unknown_fields)]` so unknown payload fields fail closed;
//!   * deterministic event/evidence hashes using the same plain JSON
//!     `JSON.stringify` input order as the TS builder;
//!   * domain-separated signed proof envelopes (`Envelope<DistributedRunProof>`);
//!   * `verify_proof`: strict JSON parsing (duplicate-key rejection), fail-closed
//!     schema, domain-separation enforcement, Ed25519 verification, then event
//!     chain + evidence hash integrity.
//!
//! PROTOCOL-1.0-SPEC §2 defines the signature domains. RunProof is registered
//! as an object in §3 but has no dedicated signature domain in the reference;
//! this crate defines `arcana:runproof:v1` so portable signed proof exports can
//! be verified with domain separation. `arcana:node-proof-batch:v1` is the
//! spec's own proof-domain constant and is accepted by default in `verify_proof`.

use std::collections::HashSet;
use std::fmt;

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::canonical;
use crate::envelope::Envelope;
use crate::strict_json;

// Domain Constants

pub const RUNPROOF_SCHEMA_VERSION: &str = "0.2";
pub const DOMAIN_RUNPROOF: &str = "arcana:runproof:v1";
pub const DOMAIN_NODE_PROOF_BATCH: &str = "arcana:node-proof-batch:v1";

// Evidence Types

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkloadAssuranceLevel {
    Declared,
    OsObserved,
    SignedBinary,
    HardwareAttested,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DistributedVerification {
    Verified,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LocalPdpDecision {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PreEffectRecheck {
    Passed,
    Failed,
}

/// The distributed authorization evidence recorded in a RunProof
/// (mirrors `DistributedAuthorizationEvidence` in runproof.ts).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DistributedAuthorizationEvidence {
    pub version: u32,
    pub envelope_hash: String,
    pub envelope_schema: String,
    pub issuer_id: String,
    pub issuer_epoch: u64,
    pub node_id: String,
    pub workload_id: String,
    pub workload_assurance: WorkloadAssuranceLevel,
    pub workload_evidence_hash: String,
    pub principal_id: String,
    pub session_id: String,
    pub workspace_id: String,
    pub policy_sequence: u64,
    pub policy_digest: String,
    pub revocation_sequence: u64,
    pub revocation_digest: String,
    pub emergency_epoch: u64,
    pub derived_local_grant_id: String,
    pub derived_grant_hash: String,
    pub effective_expires_at: String,
    pub request_hash: String,
    pub distributed_verification: DistributedVerification,
    pub local_pdp_decision: LocalPdpDecision,
    pub pre_effect_recheck: PreEffectRecheck,
    pub effect: EffectEvidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EffectEvidence {
    pub kind: String,
    pub resource: String,
    pub maximum_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes_read: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_hash: Option<String>,
}

// RunProof Events

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RunProofEventKind {
    DistributedEnvelopeReceived,
    DistributedVerificationPassed,
    DistributedVerificationFailed,
    LocalGrantDerived,
    LocalPdpAllow,
    LocalPdpDeny,
    PepRecheckPassed,
    PepRecheckFailed,
    EffectExecuted,
    EffectReceipt,
    EffectDenied,
    TraceComplete,
    TraceDegraded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RunProofEvent {
    pub event_id: String,
    pub kind: RunProofEventKind,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub causal_parent_id: Option<String>,
    pub detail: Value,
    pub integrity_hash: String,
}

// Trace Health / Integrity Status

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuthorizationTraceHealth {
    Complete,
    Degraded,
    Invalid,
    Incomplete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IntegrityStatus {
    Valid,
    Invalid,
    Unknown,
}

// RunProof State

/// A distributed authorization RunProof (mirrors `DistributedRunProof`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DistributedRunProof {
    pub run_proof_id: String,
    pub node_id: String,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub envelope_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grant_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pdp_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pep_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_event_id: Option<String>,
    pub trace_health: AuthorizationTraceHealth,
    pub integrity_status: IntegrityStatus,
    pub events: Vec<RunProofEvent>,
    pub evidence_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

// Deterministic Hash Helpers
//
// The TS builder computes hashes over plain `JSON.stringify` output (key
// insertion order), NOT the canonical serializer. These helpers reproduce that
// exact input ordering: causalParentId is omitted when absent (JSON.stringify
// drops `undefined` values).

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn event_integrity_input(event: &RunProofEvent) -> String {
    let mut s = String::from("{");
    s.push_str(&format!(
        "\"eventId\":{},",
        serde_json::to_string(&event.event_id).unwrap()
    ));
    s.push_str(&format!(
        "\"kind\":{},",
        serde_json::to_string(&event.kind).unwrap()
    ));
    s.push_str(&format!(
        "\"timestamp\":{},",
        serde_json::to_string(&event.timestamp).unwrap()
    ));
    if let Some(parent) = &event.causal_parent_id {
        s.push_str(&format!("\"causalParentId\":{},", serde_json::to_string(parent).unwrap()));
    }
    s.push_str(&format!(
        "\"detail\":{}",
        serde_json::to_string(&event.detail).unwrap()
    ));
    s.push('}');
    s
}

/// Recompute an event's integrity hash: `sha256(JSON.stringify({eventId, kind,
/// timestamp, causalParentId?, detail}))`.
pub fn compute_event_integrity_hash(event: &RunProofEvent) -> String {
    sha256_hex(&event_integrity_input(event))
}

fn evidence_input(proof: &DistributedRunProof) -> String {
    let hashes: Vec<&str> = proof.events.iter().map(|e| e.integrity_hash.as_str()).collect();
    let events_json = serde_json::to_string(&hashes).unwrap();
    format!(
        "{{\"runProofId\":{},\"nodeId\":{},\"events\":{},\"traceHealth\":{}}}",
        serde_json::to_string(&proof.run_proof_id).unwrap(),
        serde_json::to_string(&proof.node_id).unwrap(),
        events_json,
        serde_json::to_string(&proof.trace_health).unwrap(),
    )
}

/// Recompute the overall evidence hash:
/// `sha256(JSON.stringify({runProofId, nodeId, events: [integrityHash...], traceHealth}))`.
pub fn compute_evidence_hash(proof: &DistributedRunProof) -> String {
    sha256_hex(&evidence_input(proof))
}

/// Verify the event chain: every event's integrity hash recomputes to the
/// stored value and every causal parent id references a known event id.
pub fn verify_event_chain_integrity(proof: &DistributedRunProof) -> bool {
    let ids: HashSet<&str> = proof.events.iter().map(|e| e.event_id.as_str()).collect();
    for event in &proof.events {
        if compute_event_integrity_hash(event) != event.integrity_hash {
            return false;
        }
        if let Some(parent) = &event.causal_parent_id {
            if !ids.contains(parent.as_str()) {
                return false;
            }
        }
    }
    true
}

impl DistributedRunProof {
    /// Sign the proof as a domain-separated envelope. The domain must be one of
    /// the proof domains (e.g. `DOMAIN_RUNPROOF` or `DOMAIN_NODE_PROOF_BATCH`).
    pub fn sign(&self, signing_key: &SigningKey, domain: &str) -> Envelope<DistributedRunProof> {
        let public_key = signing_key.verifying_key();
        let key_id = canonical::encode_base64url(public_key.to_bytes().as_ref());
        let payload_value = serde_json::to_value(self).expect("serialization must succeed");
        let sig_bytes = signing_key.sign(&canonical::build_signature_input(domain, &payload_value));
        Envelope {
            domain: domain.to_string(),
            payload: self.clone(),
            signature: canonical::encode_base64url(&sig_bytes.to_bytes()),
            key_id,
        }
    }

    /// Evaluate trace health and integrity status exactly like the TS
    /// `RunProofBuilder.evaluateTrace()`.
    pub fn evaluate_trace_health(&mut self) -> AuthorizationTraceHealth {
        let has_envelope = self.envelope_event_id.is_some();
        let has_verification = self.verification_event_id.is_some();
        let has_grant = self.grant_event_id.is_some();
        let has_pdp = self.pdp_event_id.is_some();
        let has_pep = self.pep_event_id.is_some();
        let has_effect = self.effect_event_id.is_some();
        let has_receipt = self.receipt_event_id.is_some();

        let verification_passed = self
            .events
            .iter()
            .any(|e| e.kind == RunProofEventKind::DistributedVerificationPassed);
        let pdp_allowed = self
            .events
            .iter()
            .any(|e| e.kind == RunProofEventKind::LocalPdpAllow);
        let pep_passed = self
            .events
            .iter()
            .any(|e| e.kind == RunProofEventKind::PepRecheckPassed);

        let integrity_valid = verify_event_chain_integrity(self);
        self.integrity_status = if integrity_valid {
            IntegrityStatus::Valid
        } else {
            IntegrityStatus::Invalid
        };

        if !integrity_valid {
            self.trace_health = AuthorizationTraceHealth::Invalid;
            return self.trace_health;
        }

        if has_effect || has_receipt {
            if !has_envelope || !verification_passed || !has_grant {
                self.trace_health = AuthorizationTraceHealth::Degraded;
                return self.trace_health;
            }
            if !pdp_allowed || !pep_passed {
                self.trace_health = AuthorizationTraceHealth::Invalid;
                return self.trace_health;
            }
            if has_effect && !has_receipt {
                self.trace_health = AuthorizationTraceHealth::Degraded;
                return self.trace_health;
            }
        }

        if has_envelope
            && has_verification
            && has_grant
            && has_pdp
            && has_pep
            && has_effect
            && has_receipt
        {
            if verification_passed && pdp_allowed && pep_passed {
                self.trace_health = AuthorizationTraceHealth::Complete;
                return self.trace_health;
            }
            self.trace_health = AuthorizationTraceHealth::Invalid;
            return self.trace_health;
        }

        if (has_verification && !verification_passed)
            || (has_pdp && !pdp_allowed)
            || (has_pep && !pep_passed)
        {
            self.trace_health = AuthorizationTraceHealth::Complete;
            return self.trace_health;
        }

        self.trace_health = AuthorizationTraceHealth::Incomplete;
        self.trace_health
    }
}

// Proof Verification

#[derive(Debug)]
pub enum ProofError {
    Parse(String),
    Schema(String),
    WrongDomain(String),
    InvalidSignature,
    IntegrityMismatch(String),
}

impl fmt::Display for ProofError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProofError::Parse(msg) => write!(f, "proof parse error: {}", msg),
            ProofError::Schema(msg) => write!(f, "proof schema error: {}", msg),
            ProofError::WrongDomain(msg) => write!(f, "proof domain error: {}", msg),
            ProofError::InvalidSignature => write!(f, "invalid Ed25519 proof signature"),
            ProofError::IntegrityMismatch(msg) => write!(f, "proof integrity mismatch: {}", msg),
        }
    }
}

impl std::error::Error for ProofError {}

/// Strictly parse a signed proof envelope: duplicate-key rejection, object-only
/// root, fail-closed on unknown envelope-wrapper and payload fields.
pub fn parse_signed_proof(raw: &str) -> Result<Envelope<DistributedRunProof>, ProofError> {
    let value = strict_json::parse_strict_envelope(raw).map_err(|e| ProofError::Parse(e.to_string()))?;

    // Fail closed on unknown fields in the envelope wrapper.
    if let Value::Object(map) = &value {
        for key in map.keys() {
            if !matches!(key.as_str(), "domain" | "payload" | "signature" | "key_id") {
                return Err(ProofError::Schema(format!("unknown envelope field: {}", key)));
            }
        }
    }

    serde_json::from_value(value).map_err(|e| ProofError::Schema(e.to_string()))
}

fn verify_signed_proof(
    proof_json: &str,
    verifying_key: &VerifyingKey,
    expected_domains: &[&str],
) -> Result<Envelope<DistributedRunProof>, ProofError> {
    let envelope = parse_signed_proof(proof_json)?;

    // Domain separation: the envelope's signature domain must be permitted.
    if !expected_domains.contains(&envelope.domain.as_str()) {
        return Err(ProofError::WrongDomain(format!(
            "domain {} not in expected set {:?}",
            envelope.domain, expected_domains
        )));
    }

    // Signature over UTF8(domain) || canonical(unsigned payload).
    let sig_bytes = envelope
        .signature_bytes()
        .map_err(|e| ProofError::Parse(e.to_string()))?;
    let sig = Signature::from_bytes(&sig_bytes);
    let payload_value = serde_json::to_value(&envelope.payload)
        .map_err(|e| ProofError::Schema(e.to_string()))?;
    let signing_input = canonical::build_signature_input(&envelope.domain, &payload_value);
    verifying_key
        .verify(&signing_input, &sig)
        .map_err(|_| ProofError::InvalidSignature)?;

    // Chain integrity: every event hash recomputes and causal parents exist.
    if !verify_event_chain_integrity(&envelope.payload) {
        return Err(ProofError::IntegrityMismatch(
            "event chain integrity verification failed".to_string(),
        ));
    }

    // Evidence hash recomputes from the signed payload.
    let recomputed = compute_evidence_hash(&envelope.payload);
    if recomputed != envelope.payload.evidence_hash {
        return Err(ProofError::IntegrityMismatch(format!(
            "evidence hash mismatch: got {}, expected {}",
            recomputed, envelope.payload.evidence_hash
        )));
    }

    Ok(envelope)
}

/// Verify a domain-separated signed proof.
///
/// Fails closed on: duplicate JSON keys, unknown fields, disallowed signature
/// domains, an invalid Ed25519 signature, and event-chain / evidence-hash
/// integrity mismatches.
pub fn verify_proof(
    proof_json: &str,
    verifying_key: &VerifyingKey,
    expected_domains: &[&str],
) -> Result<(), ProofError> {
    verify_signed_proof(proof_json, verifying_key, expected_domains)?;
    Ok(())
}

/// Verify a signed proof and return the parsed proof on success.
pub fn verify_proof_parsed(
    proof_json: &str,
    verifying_key: &VerifyingKey,
    expected_domains: &[&str],
) -> Result<DistributedRunProof, ProofError> {
    Ok(verify_signed_proof(proof_json, verifying_key, expected_domains)?.payload)
}

// Consistency and Agreement (mirrors verifyRunProofConsistency /
// checkRunProofAgreement in runproof.ts)

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConsistencyResult {
    Consistent,
    Inconsistent(String),
}

/// Independently validate a RunProof after loading from storage: event
/// integrity hashes, trace-health claims, and the evidence hash.
pub fn verify_runproof_consistency(proof: &DistributedRunProof) -> ConsistencyResult {
    if !verify_event_chain_integrity(proof) {
        return ConsistencyResult::Inconsistent("event integrity hash mismatch".into());
    }

    let has_effect = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::EffectExecuted);
    let has_verification = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::DistributedVerificationPassed);
    let has_pdp_allow = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::LocalPdpAllow);

    match proof.trace_health {
        AuthorizationTraceHealth::Complete => {
            if has_effect {
                if !has_verification {
                    return ConsistencyResult::Inconsistent(
                        "COMPLETE trace with effect but no verification event".into(),
                    );
                }
                if !has_pdp_allow {
                    return ConsistencyResult::Inconsistent(
                        "COMPLETE trace with effect but no PDP allow event".into(),
                    );
                }
            }
        }
        AuthorizationTraceHealth::Degraded => {
            if !has_effect {
                return ConsistencyResult::Inconsistent("DEGRADED trace but no effect event".into());
            }
            if has_verification && has_pdp_allow {
                let has_grant = proof
                    .events
                    .iter()
                    .any(|e| e.kind == RunProofEventKind::LocalGrantDerived);
                let has_pep = proof
                    .events
                    .iter()
                    .any(|e| e.kind == RunProofEventKind::PepRecheckPassed);
                let has_receipt = proof
                    .events
                    .iter()
                    .any(|e| e.kind == RunProofEventKind::EffectReceipt);
                if has_grant && has_pep && has_receipt {
                    return ConsistencyResult::Inconsistent(
                        "DEGRADED trace but all events present".into(),
                    );
                }
            }
        }
        _ => {}
    }

    let recomputed = compute_evidence_hash(proof);
    if recomputed != proof.evidence_hash {
        return ConsistencyResult::Inconsistent("evidence hash mismatch".into());
    }

    ConsistencyResult::Consistent
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExpectedOutcome {
    pub verification_passed: Option<bool>,
    pub pdp_allowed: Option<bool>,
    pub effect_executed: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgreementResult {
    Agreed,
    Disagreed(String),
}

/// Check whether a RunProof agrees with an expected trace outcome.
pub fn check_runproof_agreement(
    proof: &DistributedRunProof,
    expected: &ExpectedOutcome,
) -> AgreementResult {
    let has_verification_pass = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::DistributedVerificationPassed);
    let has_pdp_allow = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::LocalPdpAllow);
    let has_effect = proof
        .events
        .iter()
        .any(|e| e.kind == RunProofEventKind::EffectExecuted);

    if let Some(expected) = expected.verification_passed {
        if has_verification_pass != expected {
            return AgreementResult::Disagreed(format!(
                "verification: RunProof={}, expected={}",
                has_verification_pass, expected
            ));
        }
    }
    if let Some(expected) = expected.pdp_allowed {
        if has_pdp_allow != expected {
            return AgreementResult::Disagreed(format!(
                "PDP: RunProof={}, expected={}",
                has_pdp_allow, expected
            ));
        }
    }
    if let Some(expected) = expected.effect_executed {
        if has_effect != expected {
            return AgreementResult::Disagreed(format!(
                "effect: RunProof={}, expected={}",
                has_effect, expected
            ));
        }
    }

    AgreementResult::Agreed
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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

    fn event(id: &str, kind: RunProofEventKind, timestamp: &str, parent: Option<&str>) -> RunProofEvent {
        RunProofEvent {
            event_id: id.into(),
            kind,
            timestamp: timestamp.into(),
            causal_parent_id: parent.map(|p| p.into()),
            detail: json!({}),
            integrity_hash: String::new(),
        }
    }

    /// A fully-hydrated COMPLETE trace: every event hash, trace health and the
    /// evidence hash are computed deterministically (mirrors the TS builder).
    fn complete_proof() -> DistributedRunProof {
        let mut proof = DistributedRunProof {
            run_proof_id: "rp-fixed-001".into(),
            node_id: "node-alpha".into(),
            session_id: "session-1".into(),
            envelope_event_id: Some("evt-1".into()),
            verification_event_id: Some("evt-2".into()),
            grant_event_id: Some("evt-3".into()),
            pdp_event_id: Some("evt-4".into()),
            pep_event_id: Some("evt-5".into()),
            effect_event_id: Some("evt-6".into()),
            receipt_event_id: Some("evt-7".into()),
            trace_health: AuthorizationTraceHealth::Incomplete,
            integrity_status: IntegrityStatus::Unknown,
            events: vec![
                event("evt-1", RunProofEventKind::DistributedEnvelopeReceived, "2026-08-02T11:00:00.000Z", None),
                event("evt-2", RunProofEventKind::DistributedVerificationPassed, "2026-08-02T11:00:05.000Z", Some("evt-1")),
                event("evt-3", RunProofEventKind::LocalGrantDerived, "2026-08-02T11:00:10.000Z", Some("evt-2")),
                event("evt-4", RunProofEventKind::LocalPdpAllow, "2026-08-02T11:00:15.000Z", Some("evt-3")),
                event("evt-5", RunProofEventKind::PepRecheckPassed, "2026-08-02T11:00:20.000Z", Some("evt-4")),
                event("evt-6", RunProofEventKind::EffectExecuted, "2026-08-02T11:00:25.000Z", Some("evt-5")),
                event("evt-7", RunProofEventKind::EffectReceipt, "2026-08-02T11:00:30.000Z", Some("evt-6")),
            ],
            evidence_hash: String::new(),
            created_at: "2026-08-02T11:00:00.000Z".into(),
            updated_at: "2026-08-02T11:00:30.000Z".into(),
        };
        for e in &mut proof.events {
            e.integrity_hash = compute_event_integrity_hash(e);
        }
        proof.evaluate_trace_health();
        proof.evidence_hash = compute_evidence_hash(&proof);
        proof
    }

    fn signed_json(proof: &DistributedRunProof, key: &SigningKey, domain: &str) -> String {
        serde_json::to_string(&proof.sign(key, domain)).unwrap()
    }

    #[test]
    fn complete_trace_evaluates_to_complete() {
        let proof = complete_proof();
        assert_eq!(proof.trace_health, AuthorizationTraceHealth::Complete);
        assert_eq!(proof.integrity_status, IntegrityStatus::Valid);
        assert_eq!(proof.evidence_hash.len(), 64);
    }

    #[test]
    fn hashes_are_deterministic() {
        let a = complete_proof();
        let b = complete_proof();
        for (ea, eb) in a.events.iter().zip(b.events.iter()) {
            assert_eq!(ea.integrity_hash, eb.integrity_hash);
            assert_eq!(ea.integrity_hash.len(), 64);
        }
        assert_eq!(a.evidence_hash, b.evidence_hash);
    }

    #[test]
    fn golden_hashes_are_stable() {
        let proof = complete_proof();
        // Pinned regression vectors for the fixed fixture above (deterministic).
        assert_eq!(
            proof.events[0].integrity_hash,
            "651aead62b9304d120d8a7e4704c37386a267d1e50490dc8857de3e206a7c81f"
        );
        assert_eq!(
            proof.events[6].integrity_hash,
            "051860edab7bf8d38e6ed613ecc5aa21718239ff68f93f04a73a66430174c71d"
        );
        assert_eq!(
            proof.evidence_hash,
            "7210d176578998c488afc7906feab5ed921280f29c7ebd9d097011aad9f968f7"
        );
    }

    #[test]
    fn sign_verify_round_trip() {
        let proof = complete_proof();
        let key = fixture_key();
        let json = signed_json(&proof, &key, DOMAIN_RUNPROOF);
        verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap();
    }

    #[test]
    fn verify_accepts_spec_proof_batch_domain() {
        let proof = complete_proof();
        let key = fixture_key();
        let json = signed_json(&proof, &key, DOMAIN_NODE_PROOF_BATCH);
        verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF, DOMAIN_NODE_PROOF_BATCH]).unwrap();
    }

    #[test]
    fn reject_wrong_domain() {
        let proof = complete_proof();
        let key = fixture_key();
        let json = signed_json(&proof, &key, DOMAIN_RUNPROOF);
        let err = verify_proof(&json, &key.verifying_key(), &[DOMAIN_NODE_PROOF_BATCH]).unwrap_err();
        assert!(matches!(err, ProofError::WrongDomain(_)));
    }

    #[test]
    fn reject_wrong_key() {
        let proof = complete_proof();
        let key = fixture_key();
        let json = signed_json(&proof, &key, DOMAIN_RUNPROOF);
        let err = verify_proof(&json, &other_key().verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::InvalidSignature));
    }

    #[test]
    fn reject_tampered_body() {
        let proof = complete_proof();
        let key = fixture_key();
        let mut value = serde_json::to_value(proof.sign(&key, DOMAIN_RUNPROOF)).unwrap();
        value["payload"]["createdAt"] = json!("2026-08-02T11:01:00.000Z");
        let json = serde_json::to_string(&value).unwrap();
        let err = verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::InvalidSignature));
    }

    #[test]
    fn reject_chain_integrity_mismatch_even_when_resigned() {
        // A re-signed proof whose stored event hash is wrong still fails.
        let mut proof = complete_proof();
        proof.events[3].integrity_hash = "0".repeat(64);
        let key = fixture_key();
        let json = signed_json(&proof, &key, DOMAIN_RUNPROOF);
        let err = verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::IntegrityMismatch(_)));
    }

    #[test]
    fn reject_unknown_envelope_field() {
        let proof = complete_proof();
        let key = fixture_key();
        let mut value = serde_json::to_value(proof.sign(&key, DOMAIN_RUNPROOF)).unwrap();
        value["evil"] = json!(1);
        let json = serde_json::to_string(&value).unwrap();
        let err = verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::Schema(_)));
    }

    #[test]
    fn reject_unknown_payload_field() {
        let proof = complete_proof();
        let key = fixture_key();
        let mut value = serde_json::to_value(proof.sign(&key, DOMAIN_RUNPROOF)).unwrap();
        value["payload"]["evil"] = json!("nope");
        let json = serde_json::to_string(&value).unwrap();
        let err = verify_proof(&json, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::Schema(_)));
    }

    #[test]
    fn reject_duplicate_json_keys() {
        let proof = complete_proof();
        let key = fixture_key();
        let envelope = proof.sign(&key, DOMAIN_RUNPROOF);
        let dup = format!(
            "{{\"domain\":{},\"domain\":{},\"payload\":{},\"signature\":{},\"key_id\":{}}}",
            serde_json::to_string(&envelope.domain).unwrap(),
            serde_json::to_string(&envelope.domain).unwrap(),
            serde_json::to_string(&envelope.payload).unwrap(),
            serde_json::to_string(&envelope.signature).unwrap(),
            serde_json::to_string(&envelope.key_id).unwrap(),
        );
        let err = verify_proof(&dup, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::Parse(_)));
    }

    #[test]
    fn reject_duplicate_payload_keys() {
        // A valid envelope whose payload JSON repeats a key is rejected by
        // strict parsing even though the payload would otherwise parse.
        let proof = complete_proof();
        let key = fixture_key();
        let envelope = proof.sign(&key, DOMAIN_RUNPROOF);
        let payload = serde_json::to_string(&envelope.payload).unwrap();
        let node_id = envelope.payload.node_id.clone();
        let dup_payload = payload.replacen(
            "\"nodeId\"",
            &format!("\"nodeId\",\"nodeId\":{}", serde_json::to_string(&node_id).unwrap()),
            1,
        );
        let dup = format!(
            "{{\"domain\":{},\"payload\":{},\"signature\":{},\"key_id\":{}}}",
            serde_json::to_string(&envelope.domain).unwrap(),
            dup_payload,
            serde_json::to_string(&envelope.signature).unwrap(),
            serde_json::to_string(&envelope.key_id).unwrap(),
        );
        let err = verify_proof(&dup, &key.verifying_key(), &[DOMAIN_RUNPROOF]).unwrap_err();
        assert!(matches!(err, ProofError::Parse(_)));
    }

    #[test]
    fn consistency_complete_proof() {
        let proof = complete_proof();
        assert_eq!(verify_runproof_consistency(&proof), ConsistencyResult::Consistent);
    }

    #[test]
    fn consistency_detects_tampered_event() {
        let mut proof = complete_proof();
        proof.events[2].detail = json!({"tampered": true});
        assert!(matches!(
            verify_runproof_consistency(&proof),
            ConsistencyResult::Inconsistent(_)
        ));
    }

    #[test]
    fn consistency_rejects_claimed_complete_with_missing_authority() {
        let mut proof = complete_proof();
        proof.verification_event_id = None;
        proof.events.retain(|e| e.kind != RunProofEventKind::DistributedVerificationPassed);
        proof.trace_health = AuthorizationTraceHealth::Complete;
        assert!(matches!(
            verify_runproof_consistency(&proof),
            ConsistencyResult::Inconsistent(_)
        ));
    }

    #[test]
    fn degraded_trace_is_consistent() {
        // Verification was skipped (no DistributedVerificationPassed event), but
        // the effect still executed. The grant re-links to the envelope event so
        // the causal chain stays intact.
        let mut proof = complete_proof();
        proof.verification_event_id = None;
        proof.events.retain(|e| e.kind != RunProofEventKind::DistributedVerificationPassed);
        for e in &mut proof.events {
            if e.event_id == "evt-3" {
                e.causal_parent_id = Some("evt-1".into());
            }
            e.integrity_hash = compute_event_integrity_hash(e);
        }
        assert_eq!(proof.evaluate_trace_health(), AuthorizationTraceHealth::Degraded);
        proof.evidence_hash = compute_evidence_hash(&proof);
        assert_eq!(verify_runproof_consistency(&proof), ConsistencyResult::Consistent);
    }

    #[test]
    fn agreement_matches_complete_trace() {
        let proof = complete_proof();
        let expected = ExpectedOutcome {
            verification_passed: Some(true),
            pdp_allowed: Some(true),
            effect_executed: Some(true),
        };
        assert_eq!(check_runproof_agreement(&proof, &expected), AgreementResult::Agreed);
    }

    #[test]
    fn agreement_detects_mismatch() {
        let proof = complete_proof();
        let expected = ExpectedOutcome {
            verification_passed: Some(false),
            pdp_allowed: None,
            effect_executed: None,
        };
        assert!(matches!(
            check_runproof_agreement(&proof, &expected),
            AgreementResult::Disagreed(_)
        ));
    }

    #[test]
    fn evidence_model_round_trips() {
        let evidence = DistributedAuthorizationEvidence {
            version: 1,
            envelope_hash: "ab".repeat(32),
            envelope_schema: "SIGNED_CAPABILITY_V1".into(),
            issuer_id: "node-alpha".into(),
            issuer_epoch: 1,
            node_id: "node-alpha".into(),
            workload_id: "wl-001".into(),
            workload_assurance: WorkloadAssuranceLevel::OsObserved,
            workload_evidence_hash: "cd".repeat(32),
            principal_id: "agent:build".into(),
            session_id: "session-1".into(),
            workspace_id: "workspace-1".into(),
            policy_sequence: 3,
            policy_digest: "ef".repeat(32),
            revocation_sequence: 1,
            revocation_digest: "10".repeat(32),
            emergency_epoch: 0,
            derived_local_grant_id: "grant-001".into(),
            derived_grant_hash: "11".repeat(32),
            effective_expires_at: "2099-12-31T23:59:59.999Z".into(),
            request_hash: "b1e96acf45c7fd998e29679720efb522dfb65463ff8633aae79f8470ed5d4168".into(),
            distributed_verification: DistributedVerification::Verified,
            local_pdp_decision: LocalPdpDecision::Allow,
            pre_effect_recheck: PreEffectRecheck::Passed,
            effect: EffectEvidence {
                kind: "FILESYSTEM_READ".into(),
                resource: "packages/**".into(),
                maximum_bytes: 1_048_576,
                bytes_read: Some(1024),
                content_hash: None,
                receipt_hash: Some("12".repeat(32)),
            },
        };
        let json = serde_json::to_string(&evidence).unwrap();
        let back: DistributedAuthorizationEvidence = serde_json::from_str(&json).unwrap();
        assert_eq!(back, evidence);
        assert!(json.contains("\"envelopeHash\""));
        assert!(json.contains("\"workloadAssurance\":\"OS_OBSERVED\""));
    }
}
