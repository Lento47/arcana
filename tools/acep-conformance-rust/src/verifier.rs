/// ACEP-1 Layered Verifier
///
/// 7-layer verification: PARSE → SCHEMA → SIGNATURE → TRUST → AUDIENCE → FRESHNESS → REVOCATION

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

/// Domain separators
pub const CAPABILITY_DOMAIN: &str = "arcana:signed-capability:v1";
pub const POLICY_DOMAIN: &str = "arcana:signed-policy:v1";
pub const NODE_IDENTITY_DOMAIN: &str = "arcana:node-identity:v1";
pub const REVOCATION_DOMAIN: &str = "arcana:revocation:v1";

/// Allowed fields per envelope type
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

/// Verify a signed envelope through all 7 layers.
pub fn verify_envelope(
    raw_json: &str,
    domain: &str,
    required_fields: &[&str],
    trusted_keys: &HashMap<String, [u8; 32]>,
    expected_audience: Option<&str>,
    known_sequences: &HashMap<String, u64>,
    now_ms: u64,
) -> VerificationResult {
    // Layer 1: PARSE
    let envelope = match strict_json::parse_strict_envelope(raw_json) {
        Ok(v) => v,
        Err(e) => {
            return VerificationResult::Rejected {
                stage: VerificationStage::Parse,
                reason: RejectionReason::SchemaUnsupported,
                detail: e.to_string(),
            }
        }
    };

    // Layer 2: SCHEMA
    if let Some(r) = validate_schema(&envelope, domain, required_fields) {
        return r;
    }

    // Layer 4: TRUST (before signature to get public key)
    let issuer_id = envelope.get("issuerId").and_then(|v| v.as_str()).unwrap_or("");
    let public_key = match trusted_keys.get(issuer_id) {
        Some(pk) => *pk,
        None => {
            return VerificationResult::Rejected {
                stage: VerificationStage::Trust,
                reason: RejectionReason::UnknownIssuer,
                detail: format!("issuer {} not in trusted set", issuer_id),
            }
        }
    };

    // Layer 3: SIGNATURE
    if let Some(r) = verify_signature(&envelope, domain, &public_key) {
        return r;
    }

    // Layer 5: AUDIENCE
    if let Some(expected) = expected_audience {
        let audience = envelope.get("audienceNodeId").and_then(|v| v.as_str()).unwrap_or("");
        if audience != expected {
            return VerificationResult::Rejected {
                stage: VerificationStage::Audience,
                reason: RejectionReason::WrongAudience,
                detail: format!("audience {} does not match expected {}", audience, expected),
            }
        }
    }

    // Layer 6: FRESHNESS
    if let Some(expires_at) = envelope.get("expiresAt").and_then(|v| v.as_str()) {
        if let Ok(expires_ms) = chrono_parse(expires_at) {
            if now_ms > expires_ms {
                return VerificationResult::Rejected {
                    stage: VerificationStage::Freshness,
                    reason: RejectionReason::Expired,
                    detail: format!("expired at {}", expires_at),
                }
            }
        }
    }

    // Layer 7: REVOCATION
    if let Some(sequence) = envelope.get("sequence").and_then(|v| v.as_u64()) {
        if let Some(known_seq) = known_sequences.get(issuer_id) {
            if sequence <= *known_seq {
                return VerificationResult::Rejected {
                    stage: VerificationStage::Revocation,
                    reason: RejectionReason::SequenceRollback,
                    detail: format!("sequence {} <= known {}", sequence, known_seq),
                }
            }
        }
    }

    VerificationResult::Valid
}

fn validate_schema(
    envelope: &Value,
    domain: &str,
    required_fields: &[&str],
) -> Option<VerificationResult> {
    // Schema version
    let sv = envelope.get("schemaVersion").and_then(|v| v.as_u64());
    if sv != Some(1) {
        return Some(VerificationResult::Rejected {
            stage: VerificationStage::Schema,
            reason: RejectionReason::SchemaUnsupported,
            detail: format!("schemaVersion: {:?}", sv),
        });
    }

    // Required fields
    for field in required_fields {
        if envelope.get(field).is_none() {
            return Some(VerificationResult::Rejected {
                stage: VerificationStage::Schema,
                reason: RejectionReason::SchemaUnsupported,
                detail: format!("missing required field: {}", field),
            });
        }
    }

    // Unknown fields
    let allowed = get_allowed_fields(domain);
    if let Some(obj) = envelope.as_object() {
        for key in obj.keys() {
            if !allowed.contains(&key.as_str()) {
                return Some(VerificationResult::Rejected {
                    stage: VerificationStage::Schema,
                    reason: RejectionReason::SchemaUnsupported,
                    detail: format!("unknown field: {}", key),
                });
            }
        }
    }

    // Timestamp format
    if let Some(issued_at) = envelope.get("issuedAt").and_then(|v| v.as_str()) {
        if !validate_timestamp(issued_at) {
            return Some(VerificationResult::Rejected {
                stage: VerificationStage::Schema,
                reason: RejectionReason::SchemaUnsupported,
                detail: "issuedAt must be UTC RFC 3339 with milliseconds".into(),
            });
        }
    }

    // Safe integer validation
    for field in &["issuerEpoch", "sequence"] {
        if let Some(val) = envelope.get(*field) {
            if val.is_number() {
                // Reject floating-point numbers
                if let Some(f) = val.as_f64() {
                    if f.fract() != 0.0 {
                        return Some(VerificationResult::Rejected {
                            stage: VerificationStage::Schema,
                            reason: RejectionReason::SchemaUnsupported,
                            detail: format!("field {} must be an integer, got float: {}", field, f),
                        });
                    }
                }
                if !validate_safe_integer(val) {
                    return Some(VerificationResult::Rejected {
                        stage: VerificationStage::Schema,
                        reason: RejectionReason::SchemaUnsupported,
                        detail: format!("field {} must be a safe integer", field),
                    });
                }
            }
        }
    }

    None
}

fn verify_signature(
    envelope: &Value,
    domain: &str,
    public_key: &[u8; 32],
) -> Option<VerificationResult> {
    use ed25519_dalek::{Signature, VerifyingKey, Verifier};

    let sig_str = match envelope.get("signature").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => {
            return Some(VerificationResult::Rejected {
                stage: VerificationStage::Signature,
                reason: RejectionReason::InvalidSignature,
                detail: "missing signature".into(),
            })
        }
    };

    let sig_bytes = match decode_canonical_base64url(sig_str) {
        Some(b) if b.len() == 64 => b,
        _ => {
            return Some(VerificationResult::Rejected {
                stage: VerificationStage::Signature,
                reason: RejectionReason::InvalidSignature,
                detail: "signature must be 64 bytes base64url".into(),
            })
        }
    };

    if public_key.len() != 32 {
        return Some(VerificationResult::Rejected {
            stage: VerificationStage::Signature,
            reason: RejectionReason::InvalidSignature,
            detail: "public key must be 32 bytes".into(),
        });
    }

    let unsigned = canonical::unsigned_payload(envelope);
    let sig_input = canonical::build_signature_input(domain, &unsigned);

    let verifying_key = match VerifyingKey::from_bytes(public_key) {
        Ok(k) => k,
        Err(_) => {
            return Some(VerificationResult::Rejected {
                stage: VerificationStage::Signature,
                reason: RejectionReason::InvalidSignature,
                detail: "invalid public key".into(),
            })
        }
    };

    let signature = Signature::from_slice(&sig_bytes).unwrap();
    if verifying_key.verify(&sig_input, &signature).is_err() {
        return Some(VerificationResult::Rejected {
            stage: VerificationStage::Signature,
            reason: RejectionReason::InvalidSignature,
            detail: "Ed25519 verification failed".into(),
        });
    }

    None
}

/// Simple ISO 8601 parser → milliseconds since epoch
fn chrono_parse(s: &str) -> Result<u64, ()> {
    // "2026-07-29T12:00:00.000Z" → milliseconds
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
