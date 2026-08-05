use acep_conformance::canonical::{
    canonicalize, decode_canonical_base64url, encode_base64url, unsigned_payload,
};
use acep_conformance::strict_json::parse_strict_envelope;
use acep_conformance::verifier::{
    self, RejectionReason, VerificationResult, VerificationStage, CAPABILITY_DOMAIN,
    NODE_IDENTITY_DOMAIN, POLICY_DOMAIN, REVOCATION_DOMAIN,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Deserialize)]
struct ConformanceVector {
    #[serde(rename = "vectorId")]
    vector_id: String,
    domain: String,
    description: String,
    #[serde(rename = "envelopeType")]
    envelope_type: String,
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "trustedIssuerId")]
    trusted_issuer_id: String,
    #[serde(rename = "unsignedPayload")]
    unsigned_payload: Value,
    #[serde(rename = "canonicalPayloadHex")]
    canonical_payload_hex: String,
    #[serde(rename = "signatureInputHex")]
    signature_input_hex: String,
    signature: String,
    #[serde(rename = "rawJson")]
    raw_json: Option<String>,
    #[serde(rename = "expectedStatus")]
    expected_status: String,
    #[serde(rename = "expectedStage")]
    expected_stage: Option<String>,
    #[serde(rename = "expectedReason")]
    expected_reason: Option<String>,
    #[serde(rename = "expectedAudience")]
    expected_audience: Option<String>,
    #[serde(rename = "trustedKeyIndex")]
    trusted_key_index: Option<usize>,
    #[serde(rename = "knownSequences")]
    known_sequences: Option<HashMap<String, u64>>,
}

fn domain_from_str(s: &str) -> &str {
    match s {
        "arcana:signed-capability:v1" => CAPABILITY_DOMAIN,
        "arcana:signed-policy:v1" => POLICY_DOMAIN,
        "arcana:node-identity:v1" => NODE_IDENTITY_DOMAIN,
        "arcana:revocation:v1" => REVOCATION_DOMAIN,
        _ => s,
    }
}

fn stage_to_string(stage: &VerificationStage) -> String {
    match stage {
        VerificationStage::Parse => "PARSE".to_string(),
        VerificationStage::Schema => "SCHEMA".to_string(),
        VerificationStage::Signature => "SIGNATURE".to_string(),
        VerificationStage::Trust => "TRUST".to_string(),
        VerificationStage::Audience => "AUDIENCE".to_string(),
        VerificationStage::Freshness => "FRESHNESS".to_string(),
        VerificationStage::Revocation => "REVOCATION".to_string(),
    }
}

fn reason_to_string(reason: &RejectionReason) -> String {
    match reason {
        RejectionReason::SchemaUnsupported => "SCHEMA_UNSUPPORTED".to_string(),
        RejectionReason::InvalidSignature => "INVALID_SIGNATURE".to_string(),
        RejectionReason::UnknownIssuer => "UNKNOWN_ISSUER".to_string(),
        RejectionReason::IssuerEpochTooOld => "ISSUER_EPOCH_TOO_OLD".to_string(),
        RejectionReason::WrongAudience => "WRONG_AUDIENCE".to_string(),
        RejectionReason::Expired => "EXPIRED".to_string(),
        RejectionReason::SequenceRollback => "SEQUENCE_ROLLBACK".to_string(),
        RejectionReason::DigestMismatch => "DIGEST_MISMATCH".to_string(),
        RejectionReason::AncestryInvalid => "ANCESTRY_INVALID".to_string(),
        RejectionReason::Revoked => "REVOKED".to_string(),
    }
}

fn result_to_status(result: &VerificationResult) -> String {
    match result {
        VerificationResult::Valid => "VERIFIED".to_string(),
        VerificationResult::Rejected { .. } => "REJECTED".to_string(),
    }
}

#[test]
fn test_conformance_vectors() {
    let vectors_json = fs::read_to_string("vectors/conformance-vectors.json")
        .expect("Failed to read conformance-vectors.json");
    let vectors: Vec<ConformanceVector> =
        serde_json::from_str(&vectors_json).expect("Failed to parse vectors");

    assert_eq!(vectors.len(), 46, "Expected 46 conformance vectors");

    let mut agreements = 0;
    let mut disagreements: Vec<String> = Vec::new();

    for vector in &vectors {
        // Build trusted keys map
        let mut trusted_keys: HashMap<String, [u8; 32]> = HashMap::new();
        // Determine which key index to use for the trusted issuer
        // Default: use the same key that signed the envelope (key[0] for most vectors)
        // For wrong-key tests: trustedKeyIndex specifies a different key
        let key_index = vector.trusted_key_index.unwrap_or(0);
        let all_pub_keys = [
            "TLWr9q15-_WrvMr8wmnYXNJlHtS4hbWGnyQa7fCluik",
            "dCK5iHWYBo4yxESKlJrbKQ0PTjW54BsO5fGh5gD-JnQ",
            "84FibkHnAn6kMb_jAJ6UvdJadGvuxGiUjWw8fF3JpUs",
            "_VC447FE6iRPv3c39VC8jdDCZQu8Gq2oM8oX_42_Mps",
            "_eT7oDCtAC98L31MMx9J0T-w7HR-zuvsY08f9MvKne8",
        ];
        if !vector.trusted_issuer_id.is_empty() && key_index < all_pub_keys.len() {
            if let Some(pk_bytes) = decode_canonical_base64url(all_pub_keys[key_index]) {
                if pk_bytes.len() == 32 {
                    let mut pk = [0u8; 32];
                    pk.copy_from_slice(&pk_bytes);
                    trusted_keys.insert(vector.trusted_issuer_id.clone(), pk);
                }
            }
        }

        let known_sequences = vector.known_sequences.clone().unwrap_or_default();
        let now_ms = 1735689600000u64; // 2025-01-01T12:00:00.000Z

        // Determine which verifier to use
        let required_fields: &[&str] = match vector.domain.as_str() {
            "arcana:signed-capability:v1" => &[
                "schemaVersion", "issuerId", "issuerEpoch", "audienceNodeId",
                "grant", "issuedAt", "expiresAt", "nonce",
                "signatureAlgorithm", "signature",
            ],
            "arcana:signed-policy:v1" => &[
                "schemaVersion", "issuerId", "issuerEpoch", "sequence",
                "policyId", "policyVersion", "policyDigest",
                "issuedAt", "expiresAt", "signatureAlgorithm", "signature",
            ],
            "arcana:node-identity:v1" => &[
                "schemaVersion", "nodeId", "organizationId", "publicKey",
                "issuerId", "issuerEpoch", "issuedAt", "expiresAt",
                "capabilities", "signatureAlgorithm", "signature",
            ],
            "arcana:revocation:v1" => &[
                "schemaVersion", "issuerId", "issuerEpoch", "sequence",
                "subjectType", "subjectId", "reason", "effectiveAt",
                "issuedAt", "signatureAlgorithm", "signature",
            ],
            _ => &[],
        };

        // For PARSE vectors, use raw JSON
        let raw_json = vector.raw_json.as_deref().unwrap_or("");

        // Reconstruct full envelope from unsigned payload + signature
        let mut full_envelope = vector.unsigned_payload.clone();
        if let Value::Object(ref mut map) = full_envelope {
            map.insert("signatureAlgorithm".to_string(), Value::String("Ed25519".to_string()));
            map.insert("signature".to_string(), Value::String(vector.signature.clone()));
        }

        let opts = verifier::VerifyOptions {
            now_ms,
            expected_audience: vector.expected_audience.as_deref(),
            known_sequences: Some(&known_sequences),
        };

        let result = if !raw_json.is_empty() {
            // PARSE stage: try to parse, then run schema if parse succeeds
            match parse_strict_envelope(raw_json) {
                Ok(parsed) => {
                    // Parse succeeded — if expected stage is SCHEMA, run verification
                    if vector.expected_stage.as_deref() == Some("SCHEMA") {
                        verifier::verify_envelope(
                            &parsed,
                            domain_from_str(&vector.domain),
                            required_fields,
                            &trusted_keys,
                            &opts,
                        )
                    } else {
                        // Expected PARSE rejection but parse succeeded
                        VerificationResult::Valid
                    }
                }
                Err(_) => VerificationResult::Rejected {
                    stage: VerificationStage::Parse,
                    reason: RejectionReason::SchemaUnsupported,
                    detail: "parse error".to_string(),
                },
            }
        } else {
            // Serialize full envelope to JSON, strictly parse, then verify
            let envelope_json = serde_json::to_string(&full_envelope).unwrap_or_default();
            match parse_strict_envelope(&envelope_json) {
                Ok(parsed) => verifier::verify_envelope(
                    &parsed,
                    domain_from_str(&vector.domain),
                    required_fields,
                    &trusted_keys,
                    &opts,
                ),
                Err(_) => VerificationResult::Rejected {
                    stage: VerificationStage::Parse,
                    reason: RejectionReason::SchemaUnsupported,
                    detail: "parse error".to_string(),
                },
            }
        };

        // Compare results
        let rust_status = result_to_status(&result);
        let expected_status = &vector.expected_status;

        let mut agree = rust_status == *expected_status;

        if let VerificationResult::Rejected { stage, reason, .. } = &result {
            if let Some(expected_stage) = &vector.expected_stage {
                if stage_to_string(stage) != *expected_stage {
                    agree = false;
                }
            }
            if let Some(expected_reason) = &vector.expected_reason {
                if reason_to_string(reason) != *expected_reason {
                    agree = false;
                }
            }
        }

        // For positive vectors, also verify canonical payload bytes match
        if vector.envelope_type == "positive" && !vector.canonical_payload_hex.is_empty() {
            let unsigned = unsigned_payload(
                &serde_json::from_str(&serde_json::to_string(&vector.unsigned_payload).unwrap())
                    .unwrap_or(Value::Null),
            );
            let canonical = canonicalize(&unsigned);
            let canonical_hex = hex::encode(canonical.as_bytes());

            if canonical_hex != vector.canonical_payload_hex {
                disagreements.push(format!(
                    "{}: canonical payload mismatch\n  expected: {}\n  got:      {}",
                    vector.vector_id, vector.canonical_payload_hex, canonical_hex
                ));
                agree = false;
            }
        }

        if agree {
            agreements += 1;
        } else {
            disagreements.push(format!(
                "{}: status={} (expected {}), stage={:?}, reason={:?}",
                vector.vector_id,
                rust_status,
                expected_status,
                match &result {
                    VerificationResult::Rejected { stage, .. } => Some(stage_to_string(stage)),
                    _ => None,
                },
                match &result {
                    VerificationResult::Rejected { reason, .. } => Some(reason_to_string(reason)),
                    _ => None,
                }
            ));
        }
    }

    // Print report
    println!("\n=== ACEP-1 Cross-Runtime Conformance Report ===");
    println!("Vectors executed: {}", vectors.len());
    println!("Agreements: {}", agreements);
    println!("Disagreements: {}", disagreements.len());

    if !disagreements.is_empty() {
        println!("\nDisagreements:");
        for d in &disagreements {
            println!("  ✗ {}", d);
        }
    }

    assert_eq!(
        disagreements.len(),
        0,
        "Cross-runtime disagreements found: {:?}",
        disagreements
    );
}

#[test]
fn test_node_identity_canonical() {
    use acep_conformance::canonical::{canonicalize, unsigned_payload, build_signature_input, encode_base64url};
    use serde_json::{json, Value};
    
    // The node identity payload from the vector
    let payload = json!({
        "schemaVersion": 1,
        "nodeId": "node-alpha",
        "organizationId": "arcana-org",
        "publicKey": "TLWr9q15-_WrvMr8wmnYXNJlHtS4hbWGnyQa7fCluik",
        "issuerId": "trust-registry",
        "issuerEpoch": 1,
        "issuedAt": "2026-07-29T12:00:00.000Z",
        "expiresAt": "2099-12-31T23:59:59.999Z",
        "capabilities": ["grant", "revoke", "verify"]
    });
    
    let canonical = canonicalize(&payload);
    let canonical_hex = hex::encode(canonical.as_bytes());
    println!("Rust canonical hex: {}", canonical_hex);
    println!("Rust canonical: {}", canonical);
    
    let sig_input = build_signature_input("arcana:node-identity:v1", &payload);
    let sig_input_hex = hex::encode(&sig_input);
    println!("Rust sig input hex: {}", sig_input_hex);
}
