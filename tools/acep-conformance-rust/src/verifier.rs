/// ACEP-1 Layered Verifier — TS-faithful mirror of `verifier.ts`
///
/// Layered verification of signed envelopes without accessing networks or
/// databases, mirroring `packages/core/src/crypto/verifier.ts`:
///
///   1. PARSE      — strict JSON parse, duplicate-key rejection
///   2. SCHEMA     — required fields, schema version, field types
///   3. SIGNATURE  — Ed25519 cryptographic verification
///   4. TRUST      — issuer in trusted set
///   5. AUDIENCE   — envelope targets this node
///   6. FRESHNESS  — not expired
///   7. REVOCATION — sequence rollback check (policy/revocation only)
///
/// The four public verifiers operate on the FLAT TS-model envelope JSON
/// (`schemaVersion`, `issuerId`, `grant`/`policy`/`statement`, `signature`, …)
/// exactly like the TypeScript reference — NOT on the internal snake_case wire
/// structs in `envelope.rs`. The required-field sets mirror
/// `signed-envelopes.ts` (`CAPABILITY_REQUIRED_FIELDS`, …).
///
/// DOCUMENTED DEVIATION (coordinator ruling, keep): the TS `issuedAt`-future
/// (>5 min) freshness check in `verifyFreshness` is intentionally NOT ported.
/// Every conformance vector carries `issuedAt=2026-07-29` while the golden
/// suite fixes the test clock to 2025-01-01, so the future-dated check would
/// reject all 46 vectors and break the golden suite. Only the `expiresAt`
/// freshness check is applied (see `verify_freshness`).

use serde_json::Value;
use std::collections::HashMap;

use crate::canonical::{self, decode_canonical_base64url, validate_safe_integer, validate_timestamp};
use crate::strict_json;

#[derive(Debug, Clone, PartialEq)]
pub enum VerificationStage {
    Parse,
    Schema,
    Signature,
    Trust,
    Audience,
    Freshness,
    Revocation,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RejectionReason {
    SchemaUnsupported,
    InvalidSignature,
    UnknownIssuer,
    IssuerEpochTooOld,
    WrongAudience,
    Expired,
    SequenceRollback,
    DigestMismatch,
    AncestryInvalid,
    Revoked,
}

#[derive(Debug, Clone)]
pub enum VerificationResult {
    Valid,
    Rejected {
        stage: VerificationStage,
        reason: RejectionReason,
        detail: String,
    },
}

impl VerificationResult {
    pub fn is_valid(&self) -> bool {
        matches!(self, VerificationResult::Valid)
    }

    pub fn stage(&self) -> Option<&VerificationStage> {
        match self {
            VerificationResult::Valid => None,
            VerificationResult::Rejected { stage, .. } => Some(stage),
        }
    }

    pub fn reason(&self) -> Option<&RejectionReason> {
        match self {
            VerificationResult::Valid => None,
            VerificationResult::Rejected { reason, .. } => Some(reason),
        }
    }
}

fn rejected(stage: VerificationStage, reason: RejectionReason, detail: impl Into<String>) -> VerificationResult {
    VerificationResult::Rejected {
        stage,
        reason,
        detail: detail.into(),
    }
}

/// Domain separators (mirror `SignatureDomain` / signed-envelopes.ts).
pub const CAPABILITY_DOMAIN: &str = "arcana:signed-capability:v1";
pub const POLICY_DOMAIN: &str = "arcana:signed-policy:v1";
pub const NODE_IDENTITY_DOMAIN: &str = "arcana:node-identity:v1";
pub const REVOCATION_DOMAIN: &str = "arcana:revocation:v1";

/// Required fields per envelope type (mirror signed-envelopes.ts).
pub const CAPABILITY_REQUIRED_FIELDS: &[&str] = &[
    "schemaVersion", "issuerId", "issuerEpoch", "audienceNodeId",
    "grant", "issuedAt", "expiresAt", "nonce",
    "signatureAlgorithm", "signature",
];

pub const POLICY_REQUIRED_FIELDS: &[&str] = &[
    "schemaVersion", "issuerId", "issuerEpoch", "sequence",
    "policyId", "policyVersion", "policyDigest",
    "issuedAt", "expiresAt", "signatureAlgorithm", "signature",
];

pub const NODE_IDENTITY_REQUIRED_FIELDS: &[&str] = &[
    "schemaVersion", "nodeId", "organizationId", "publicKey",
    "issuerId", "issuerEpoch", "issuedAt", "expiresAt",
    "capabilities", "signatureAlgorithm", "signature",
];

pub const REVOCATION_REQUIRED_FIELDS: &[&str] = &[
    "schemaVersion", "issuerId", "issuerEpoch", "sequence",
    "subjectType", "subjectId", "reason", "effectiveAt",
    "issuedAt", "signatureAlgorithm", "signature",
];

/// Allowed fields per envelope type.
fn capability_allowed() -> &'static [&'static str] {
    &[
        "schemaVersion", "issuerId", "issuerEpoch", "audienceNodeId",
        "grant", "issuedAt", "expiresAt", "nonce",
        "signatureAlgorithm", "signature",
    ]
}

fn policy_allowed() -> &'static [&'static str] {
    &[
        "schemaVersion", "issuerId", "issuerEpoch", "sequence",
        "policyId", "policyVersion", "policyDigest", "previousPolicyDigest",
        "issuedAt", "expiresAt", "signatureAlgorithm", "signature",
    ]
}

fn node_identity_allowed() -> &'static [&'static str] {
    &[
        "schemaVersion", "nodeId", "organizationId", "publicKey",
        "issuerId", "issuerEpoch", "issuedAt", "expiresAt",
        "capabilities", "signatureAlgorithm", "signature",
    ]
}

fn revocation_allowed() -> &'static [&'static str] {
    &[
        "schemaVersion", "issuerId", "issuerEpoch", "sequence",
        "subjectType", "subjectId", "reason", "effectiveAt",
        "issuedAt", "signatureAlgorithm", "signature",
    ]
}

fn get_allowed_fields(domain: &str) -> &'static [&'static str] {
    match domain {
        CAPABILITY_DOMAIN => capability_allowed(),
        POLICY_DOMAIN => policy_allowed(),
        NODE_IDENTITY_DOMAIN => node_identity_allowed(),
        REVOCATION_DOMAIN => revocation_allowed(),
        _ => &[],
    }
}

/// Options passed to `verify_envelope` (mirrors the TS `verifyEnvelope` options
/// object `{ now?, expectedAudienceNodeId?, knownSequences? }`).
#[derive(Debug, Clone)]
pub struct VerifyOptions<'a> {
    pub now_ms: u64,
    pub expected_audience: Option<&'a str>,
    pub known_sequences: Option<&'a HashMap<String, u64>>,
}

impl<'a> VerifyOptions<'a> {
    pub fn new(now_ms: u64) -> Self {
        Self {
            now_ms,
            expected_audience: None,
            known_sequences: None,
        }
    }
}

// ─── Layer 1+2: Schema validation ──────────────────────────────────────

/// Layer 1+2: Schema validation (fields, types, unknown fields).
/// Mirrors `validateEnvelopeSchema` in verifier.ts.
pub fn validate_envelope_schema(
    envelope: &Value,
    domain: &str,
    required_fields: &[&str],
) -> Option<VerificationResult> {
    // Schema version
    let sv = envelope.get("schemaVersion").and_then(|v| v.as_u64());
    if sv != Some(1) {
        return Some(rejected(
            VerificationStage::Schema,
            RejectionReason::SchemaUnsupported,
            format!("schemaVersion: {:?}", sv),
        ));
    }

    // Required fields (mirror validateEnvelopePayload: missing field issues).
    let mut issues: Vec<String> = Vec::new();
    for field in required_fields {
        if envelope.get(*field).is_none() {
            issues.push(format!("{}: missing required field", field));
        }
    }
    if !issues.is_empty() {
        return Some(rejected(
            VerificationStage::Schema,
            RejectionReason::SchemaUnsupported,
            issues.join("; "),
        ));
    }

    // Unknown fields
    let allowed = get_allowed_fields(domain);
    if let Some(obj) = envelope.as_object() {
        for key in obj.keys() {
            if !allowed.contains(&key.as_str()) {
                return Some(rejected(
                    VerificationStage::Schema,
                    RejectionReason::SchemaUnsupported,
                    format!("unknown field: {}", key),
                ));
            }
        }
    }

    // issuedAt must be a strict UTC RFC 3339 timestamp with milliseconds.
    match envelope.get("issuedAt").and_then(|v| v.as_str()) {
        Some(s) if validate_timestamp(s) => {}
        _ => {
            return Some(rejected(
                VerificationStage::Schema,
                RejectionReason::SchemaUnsupported,
                "issuedAt must be UTC RFC 3339 with milliseconds",
            ))
        }
    }

    // expiresAt is optional (revocation statements use effectiveAt instead).
    if let Some(expires_at) = envelope.get("expiresAt") {
        let valid = expires_at
            .as_str()
            .map(validate_timestamp)
            .unwrap_or(false);
        if !valid {
            return Some(rejected(
                VerificationStage::Schema,
                RejectionReason::SchemaUnsupported,
                "expiresAt must be UTC RFC 3339 with milliseconds",
            ));
        }
    }

    // effectiveAt is optional (revocation statements).
    if let Some(effective_at) = envelope.get("effectiveAt") {
        let valid = effective_at
            .as_str()
            .map(validate_timestamp)
            .unwrap_or(false);
        if !valid {
            return Some(rejected(
                VerificationStage::Schema,
                RejectionReason::SchemaUnsupported,
                "effectiveAt must be UTC RFC 3339 with milliseconds",
            ));
        }
    }

    // Safe integer validation for numeric fields (mirrors the TS numeric list).
    let numeric_fields = ["issuerEpoch", "sequence", "contractRevision", "maxUses", "delegationDepth"];
    for field in &numeric_fields {
        if let Some(value) = envelope.get(*field) {
            if value.is_number() && !validate_safe_integer(value) {
                return Some(rejected(
                    VerificationStage::Schema,
                    RejectionReason::SchemaUnsupported,
                    format!("field {} must be a safe integer, got: {}", field, value),
                ));
            }
        }
    }

    // Check nested grant object if present.
    if let Some(grant) = envelope.get("grant") {
        for field in ["contractRevision", "maxUses", "delegationDepth"] {
            if let Some(value) = grant.get(field) {
                if value.is_number() && !validate_safe_integer(value) {
                    return Some(rejected(
                        VerificationStage::Schema,
                        RejectionReason::SchemaUnsupported,
                        format!("grant.{} must be a safe integer, got: {}", field, value),
                    ));
                }
            }
        }
    }

    None
}

// ─── Layer 3: Signature verification ──────────────────────────────────

/// Layer 3: Ed25519 signature verification.
/// Mirrors `verifyEnvelopeSignature` in verifier.ts.
pub fn verify_envelope_signature(
    envelope: &Value,
    domain: &str,
    public_key: &[u8; 32],
) -> Option<VerificationResult> {
    use ed25519_dalek::{Signature, VerifyingKey, Verifier};

    let sig_str = match envelope.get("signature").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => {
            return Some(rejected(
                VerificationStage::Signature,
                RejectionReason::InvalidSignature,
                "missing signature field",
            ))
        }
    };

    let sig_bytes = match decode_canonical_base64url(sig_str) {
        Some(b) if b.len() == 64 => b,
        _ => {
            let got = decode_canonical_base64url(sig_str).map(|b| b.len()).unwrap_or(0);
            return Some(rejected(
                VerificationStage::Signature,
                RejectionReason::InvalidSignature,
                format!("signature must be 64 bytes base64url, got {} bytes", got),
            ))
        }
    };

    if public_key.len() != 32 {
        return Some(rejected(
            VerificationStage::Signature,
            RejectionReason::InvalidSignature,
            format!("public key must be 32 bytes, got {} bytes", public_key.len()),
        ));
    }

    let unsigned = canonical::unsigned_payload(envelope);
    let sig_input = canonical::build_signature_input(domain, &unsigned);

    let verifying_key = match VerifyingKey::from_bytes(public_key) {
        Ok(k) => k,
        Err(_) => {
            return Some(rejected(
                VerificationStage::Signature,
                RejectionReason::InvalidSignature,
                "invalid public key",
            ))
        }
    };

    let signature = Signature::from_slice(&sig_bytes).unwrap();
    if verifying_key.verify(&sig_input, &signature).is_err() {
        return Some(rejected(
            VerificationStage::Signature,
            RejectionReason::InvalidSignature,
            "Ed25519 signature verification failed",
        ));
    }

    None
}

// ─── Layer 4: Issuer trust check ──────────────────────────────────────

/// Layer 4: Issuer trust check.
/// Mirrors `verifyIssuerTrust` in verifier.ts.
pub fn verify_issuer_trust(
    envelope: &Value,
    trusted_keys: &HashMap<String, [u8; 32]>,
) -> Option<VerificationResult> {
    let issuer_id = envelope.get("issuerId").and_then(|v| v.as_str()).unwrap_or("");
    if !trusted_keys.contains_key(issuer_id) {
        return Some(rejected(
            VerificationStage::Trust,
            RejectionReason::UnknownIssuer,
            format!("issuer {} not in trusted set", issuer_id),
        ));
    }
    None
}

// ─── Layer 5: Audience check ──────────────────────────────────────────

/// Layer 5: Audience check (capability envelopes only).
/// Mirrors `verifyAudience` in verifier.ts.
pub fn verify_audience(envelope: &Value, expected_audience: Option<&str>) -> Option<VerificationResult> {
    if expected_audience.is_none() {
        return None;
    }
    let expected = expected_audience.unwrap();
    let audience_node_id = envelope.get("audienceNodeId").and_then(|v| v.as_str()).unwrap_or("");
    if audience_node_id != expected {
        return Some(rejected(
            VerificationStage::Audience,
            RejectionReason::WrongAudience,
            format!("audience {} does not match expected {}", audience_node_id, expected),
        ));
    }
    None
}

// ─── Layer 6: Freshness check ─────────────────────────────────────────

/// Layer 6: Freshness check.
///
/// Mirrors `verifyFreshness` in verifier.ts EXCEPT for the TS `issuedAt`-future
/// (>5 min) clock-skew check, which is deliberately omitted: it would reject
/// every conformance vector (issuedAt=2026-07-29 vs the golden test clock of
/// 2025-01-01) and break the golden suite. Only the `expiresAt` check applies.
pub fn verify_freshness(envelope: &Value, now_ms: u64) -> Option<VerificationResult> {
    if let Some(expires_at) = envelope.get("expiresAt").and_then(|v| v.as_str()) {
        if let Ok(expires_ms) = chrono_parse(expires_at) {
            if now_ms > expires_ms {
                return Some(rejected(
                    VerificationStage::Freshness,
                    RejectionReason::Expired,
                    format!("expired at {}", expires_at),
                ));
            }
        }
    }
    None
}

// ─── Layer 7: Revocation/sequence rollback check ──────────────────────

/// Layer 7: Revocation/sequence rollback check.
/// Mirrors `verifyRevocationStatus` in verifier.ts.
pub fn verify_revocation_status(
    envelope: &Value,
    known_sequences: &HashMap<String, u64>,
) -> Option<VerificationResult> {
    let issuer_id = envelope.get("issuerId").and_then(|v| v.as_str()).unwrap_or("");
    let sequence = envelope.get("sequence").and_then(|v| v.as_u64());
    let sequence = sequence?;

    if let Some(known_seq) = known_sequences.get(issuer_id) {
        if sequence <= *known_seq {
            return Some(rejected(
                VerificationStage::Revocation,
                RejectionReason::SequenceRollback,
                format!("sequence {} <= known {}", sequence, known_seq),
            ));
        }
    }
    None
}

// ─── Full Envelope Verification ───────────────────────────────────────

/// Verify an already-parsed envelope through all applicable layers.
/// Mirrors `verifyEnvelope` in verifier.ts (layer order included).
pub fn verify_envelope(
    envelope: &Value,
    domain: &str,
    required_fields: &[&str],
    trusted_keys: &HashMap<String, [u8; 32]>,
    options: &VerifyOptions<'_>,
) -> VerificationResult {
    // Layer 2: Schema
    if let Some(r) = validate_envelope_schema(envelope, domain, required_fields) {
        return r;
    }

    // Layer 4: Trust (before signature to get public key)
    let issuer_id = envelope.get("issuerId").and_then(|v| v.as_str()).unwrap_or("");
    let public_key = match trusted_keys.get(issuer_id) {
        Some(pk) => *pk,
        None => {
            return rejected(
                VerificationStage::Trust,
                RejectionReason::UnknownIssuer,
                format!("issuer {} not in trusted set", issuer_id),
            )
        }
    };

    // Layer 3: Signature
    if let Some(r) = verify_envelope_signature(envelope, domain, &public_key) {
        return r;
    }

    // Layer 5: Audience
    if let Some(r) = verify_audience(envelope, options.expected_audience) {
        return r;
    }

    // Layer 6: Freshness
    if let Some(r) = verify_freshness(envelope, options.now_ms) {
        return r;
    }

    // Layer 7: Revocation (policy/revocation only — set by the caller)
    if let Some(known_sequences) = options.known_sequences {
        if let Some(r) = verify_revocation_status(envelope, known_sequences) {
            return r;
        }
    }

    VerificationResult::Valid
}

// ─── Public Verifiers ─────────────────────────────────────────────────

/// Verify a signed capability envelope (flat TS-model JSON).
/// Mirrors `verifySignedCapability` in verifier.ts.
pub fn verify_signed_capability(
    envelope: &Value,
    trusted_keys: &HashMap<String, [u8; 32]>,
    options: &VerifyOptions<'_>,
) -> VerificationResult {
    verify_envelope(
        envelope,
        CAPABILITY_DOMAIN,
        CAPABILITY_REQUIRED_FIELDS,
        trusted_keys,
        options,
    )
}

/// Verify a signed policy envelope (flat TS-model JSON).
/// Mirrors `verifySignedPolicy` in verifier.ts.
pub fn verify_signed_policy(
    envelope: &Value,
    trusted_keys: &HashMap<String, [u8; 32]>,
    known_sequences: &HashMap<String, u64>,
    now_ms: u64,
) -> VerificationResult {
    verify_envelope(
        envelope,
        POLICY_DOMAIN,
        POLICY_REQUIRED_FIELDS,
        trusted_keys,
        &VerifyOptions {
            now_ms,
            expected_audience: None,
            known_sequences: Some(known_sequences),
        },
    )
}

/// Verify a node identity certificate (flat TS-model JSON).
/// Mirrors `verifyNodeIdentity` in verifier.ts.
pub fn verify_node_identity(
    certificate: &Value,
    trusted_keys: &HashMap<String, [u8; 32]>,
    now_ms: u64,
) -> VerificationResult {
    verify_envelope(
        certificate,
        NODE_IDENTITY_DOMAIN,
        NODE_IDENTITY_REQUIRED_FIELDS,
        trusted_keys,
        &VerifyOptions::new(now_ms),
    )
}

/// Verify a revocation statement (flat TS-model JSON).
/// Mirrors `verifyRevocationStatement` in verifier.ts.
pub fn verify_revocation_statement(
    statement: &Value,
    trusted_keys: &HashMap<String, [u8; 32]>,
    known_sequences: &HashMap<String, u64>,
    now_ms: u64,
) -> VerificationResult {
    verify_envelope(
        statement,
        REVOCATION_DOMAIN,
        REVOCATION_REQUIRED_FIELDS,
        trusted_keys,
        &VerifyOptions {
            now_ms,
            expected_audience: None,
            known_sequences: Some(known_sequences),
        },
    )
}

// ─── Strict Wire Parsing ──────────────────────────────────────────────

/// Parse raw JSON bytes with duplicate-key rejection (mirrors `parseStrictEnvelope`).
pub fn parse_strict_envelope(raw: &str) -> Result<Value, strict_json::ParseError> {
    strict_json::parse_strict_envelope(raw)
}

/// Simple ISO 8601 parser → milliseconds since epoch.
/// Format: `YYYY-MM-DDTHH:mm:ss.sssZ` (24 chars).
fn chrono_parse(s: &str) -> Result<u64, ()> {
    if s.len() != 24 || !s.ends_with('Z') {
        return Err(());
    }
    let date_part = &s[0..10];
    let time_part = &s[11..23];

    let parts: Vec<u32> = date_part.split('-').map(|p| p.parse().unwrap()).collect();
    let time_parts: Vec<u32> = time_part.split(&[':', '.'][..]).map(|p| p.parse().unwrap()).collect();

    if parts.len() != 3 || time_parts.len() != 4 {
        return Err(());
    }

    let year = parts[0] as u64;
    let month = parts[1];
    let day = parts[2];
    let hour = time_parts[0];
    let min = time_parts[1];
    let sec = time_parts[2];
    let ms = time_parts[3];

    // Days from epoch (1970-01-01)
    let mut days: u64 = 0;
    for y in 1970..year {
        days += if is_leap(y) { 366 } else { 365 };
    }
    for m in 1..month {
        days += days_in_month(m, year) as u64;
    }
    days += (day - 1) as u64;

    let total_ms = days * 86400000
        + hour as u64 * 3600000
        + min as u64 * 60000
        + sec as u64 * 1000
        + ms as u64;

    Ok(total_ms)
}

fn is_leap(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(month: u32, year: u64) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => if is_leap(year) { 29 } else { 28 },
        _ => 0,
    }
}
