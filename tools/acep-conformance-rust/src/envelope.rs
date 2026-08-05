//! ACEP-1 Signed Envelope Types
//!
//! Domain-separated Ed25519 envelope model mirroring
//! `packages/core/src/crypto/signed-envelopes.ts` and
//! the protocol spec signature domains.
//!
//! Seven signing domains from PROTOCOL-1.0-SPEC.md:
//!   arcana:signed-capability:v1
//!   arcana:signed-policy:v1
//!   arcana:node-identity:v1
//!   arcana:revocation:v1
//!   arcana:node-proof-batch:v1
//!   arcana:join-token:v1
//!   arcana:sync-request:v1 / response / ack

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fmt;

use crate::canonical;

// Domain Constants

pub const DOMAIN_SIGNED_CAPABILITY: &str = "arcana:signed-capability:v1";
pub const DOMAIN_SIGNED_POLICY: &str = "arcana:signed-policy:v1";
pub const DOMAIN_NODE_IDENTITY: &str = "arcana:node-identity:v1";
pub const DOMAIN_REVOCATION: &str = "arcana:revocation:v1";
pub const DOMAIN_NODE_PROOF_BATCH: &str = "arcana:node-proof-batch:v1";
pub const DOMAIN_JOIN_TOKEN: &str = "arcana:join-token:v1";
pub const DOMAIN_SYNC_REQUEST: &str = "arcana:sync-request:v1";
pub const DOMAIN_SYNC_RESPONSE: &str = "arcana:sync-response:v1";
pub const DOMAIN_SYNC_ACK: &str = "arcana:sync-ack:v1";

// Envelope Wrapper

/// A domain-separated signed envelope.
///
/// The signature input is:
///   UTF8(domain) || canonical(unsigned_payload)
///
/// Unknown fields in the payload are rejected during deserialization
/// (via `#[serde(deny_unknown_fields)]` on the inner type).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub domain: String,
    pub payload: T,
    pub signature: String,
    pub key_id: String,
}

impl<T> Envelope<T> {
    /// Return the signature as raw bytes.
    pub fn signature_bytes(&self) -> Result<[u8; 64], EnvelopeError> {
        match canonical::decode_base64url(&self.signature) {
            Some(bytes) if bytes.len() == 64 => {
                let mut out = [0u8; 64];
                out.copy_from_slice(&bytes);
                Ok(out)
            }
            Some(_) => Err(EnvelopeError::DecodeError("signature must be 64 bytes".to_string())),
            None => Err(EnvelopeError::DecodeError("invalid base64url signature".to_string())),
        }
    }

    /// Verify the envelope signature against a known public key.
    ///
    /// Returns Ok(()) if the signature is valid, or an error otherwise.
    pub fn verify(&self, public_key: &VerifyingKey) -> Result<(), EnvelopeError>
    where
        T: Serialize,
    {
        let sig_bytes = self.signature_bytes()?;
        let sig = Signature::from_bytes(&sig_bytes);
        let payload_value = serde_json::to_value(&self.payload)
            .map_err(|e| EnvelopeError::CanonicalizationError(e.to_string()))?;
        let signing_input = canonical::build_signature_input(&self.domain, &payload_value);
        public_key
            .verify(&signing_input, &sig)
            .map_err(|_| EnvelopeError::InvalidSignature)
    }
}

// Signed Capability Envelope

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedCapabilityEnvelope {
    pub grant_id: String,
    pub principal_id: String,
    pub actions: Vec<String>,
    pub resources: Vec<String>,
    pub workspace_id: String,
    pub contract_id: String,
    pub contract_revision: u64,
    pub max_uses: Option<u64>,
    pub remaining_uses: Option<u64>,
    pub delegation_depth: u32,
    pub expires_at: String,
    pub status: GrantStatus,
}

impl SignedCapabilityEnvelope {
    pub fn sign(&self, signing_key: &SigningKey) -> Envelope<SignedCapabilityEnvelope> {
        let public_key = signing_key.verifying_key();
        let key_id = canonical::encode_base64url(public_key.to_bytes().as_ref());
        let payload_value = serde_json::to_value(self)
            .expect("serialization must succeed");
        let sig_bytes = signing_key.sign(&canonical::build_signature_input(
            DOMAIN_SIGNED_CAPABILITY,
            &payload_value,
        ));
        Envelope {
            domain: DOMAIN_SIGNED_CAPABILITY.to_string(),
            payload: self.clone(),
            signature: canonical::encode_base64url(&sig_bytes.to_bytes()),
            key_id,
        }
    }
}

// Signed Policy Envelope

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedPolicyEnvelope {
    pub policy_id: String,
    pub version: String,
    pub rules: Vec<PolicyRule>,
    pub effective_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyRule {
    pub rule_id: String,
    pub kind: RuleKind,
    pub description: String,
    pub conditions: RuleConditions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum RuleKind {
    Deny,
    Approval,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuleConditions {
    pub actions: Option<Vec<String>>,
    pub provenance: Option<Vec<String>>,
    pub sensitivity: Option<Vec<String>>,
    pub resource_kinds: Option<Vec<String>>,
    pub network_hosts: Option<Vec<String>>,
    pub principal_ids: Option<Vec<String>>,
}

impl SignedPolicyEnvelope {
    pub fn sign(&self, signing_key: &SigningKey) -> Envelope<SignedPolicyEnvelope> {
        let public_key = signing_key.verifying_key();
        let key_id = canonical::encode_base64url(public_key.to_bytes().as_ref());
        let payload_value = serde_json::to_value(self)
            .expect("serialization must succeed");
        let sig_bytes = signing_key.sign(&canonical::build_signature_input(
            DOMAIN_SIGNED_POLICY,
            &payload_value,
        ));
        Envelope {
            domain: DOMAIN_SIGNED_POLICY.to_string(),
            payload: self.clone(),
            signature: canonical::encode_base64url(&sig_bytes.to_bytes()),
            key_id,
        }
    }
}

// Node Identity Certificate

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodeIdentityCertificate {
    pub node_id: String,
    pub operator_id: String,
    pub workspace_id: String,
    pub public_key: String,
    pub issued_at: String,
    pub expires_at: String,
    pub proof_chain: Vec<String>,
}

impl NodeIdentityCertificate {
    pub fn sign(&self, signing_key: &SigningKey) -> Envelope<NodeIdentityCertificate> {
        let public_key = signing_key.verifying_key();
        let key_id = canonical::encode_base64url(public_key.to_bytes().as_ref());
        let payload_value = serde_json::to_value(self)
            .expect("serialization must succeed");
        let sig_bytes = signing_key.sign(&canonical::build_signature_input(
            DOMAIN_NODE_IDENTITY,
            &payload_value,
        ));
        Envelope {
            domain: DOMAIN_NODE_IDENTITY.to_string(),
            payload: self.clone(),
            signature: canonical::encode_base64url(&sig_bytes.to_bytes()),
            key_id,
        }
    }
}

// Revocation Statement

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevocationStatement {
    pub revocation_id: String,
    pub grant_id: String,
    pub reason: String,
    pub revoked_by: String,
    pub revoked_at: String,
    pub effective_immediately: bool,
}

impl RevocationStatement {
    pub fn sign(&self, signing_key: &SigningKey) -> Envelope<RevocationStatement> {
        let public_key = signing_key.verifying_key();
        let key_id = canonical::encode_base64url(public_key.to_bytes().as_ref());
        let payload_value = serde_json::to_value(self)
            .expect("serialization must succeed");
        let sig_bytes = signing_key.sign(&canonical::build_signature_input(
            DOMAIN_REVOCATION,
            &payload_value,
        ));
        Envelope {
            domain: DOMAIN_REVOCATION.to_string(),
            payload: self.clone(),
            signature: canonical::encode_base64url(&sig_bytes.to_bytes()),
            key_id,
        }
    }
}

// Grant Status

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GrantStatus {
    Active,
    Revoked,
    Exhausted,
    Expired,
}

// Error Types

#[derive(Debug)]
pub enum EnvelopeError {
    InvalidSignature,
    CanonicalizationError(String),
    DecodeError(String),
}

impl fmt::Display for EnvelopeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EnvelopeError::InvalidSignature => write!(f, "invalid Ed25519 signature"),
            EnvelopeError::CanonicalizationError(msg) => {
                write!(f, "canonicalization error: {}", msg)
            }
            EnvelopeError::DecodeError(msg) => write!(f, "decode error: {}", msg),
        }
    }
}

impl std::error::Error for EnvelopeError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::canonical;

    fn fixture_signing_key() -> SigningKey {
        let mut seed = [0u8; 32];
        seed[0] = 0x42;
        SigningKey::from_bytes(&seed)
    }

    #[test]
    fn sign_verify_capability_envelope() {
        let envelope = SignedCapabilityEnvelope {
            grant_id: "grant-001".into(),
            principal_id: "agent:build".into(),
            actions: vec!["process.execute".into()],
            resources: vec!["*".into()],
            workspace_id: "workspace-1".into(),
            contract_id: "contract-1".into(),
            contract_revision: 3,
            max_uses: Some(10),
            remaining_uses: Some(10),
            delegation_depth: 0,
            expires_at: "2099-12-31T23:59:59.999Z".into(),
            status: GrantStatus::Active,
        };
        let signing_key = fixture_signing_key();
        let env = envelope.sign(&signing_key);
        let pk = signing_key.verifying_key();
        assert!(env.verify(&pk).is_ok(), "capability envelope should verify");
    }

    #[test]
    fn sign_verify_policy_envelope() {
        let envelope = SignedPolicyEnvelope {
            policy_id: "policy-001".into(),
            version: "1.0.0".into(),
            rules: vec![PolicyRule {
                rule_id: "rule-001".into(),
                kind: RuleKind::Deny,
                description: "Deny process.execute".into(),
                conditions: RuleConditions {
                    actions: Some(vec!["process.execute".into()]),
                    provenance: None,
                    sensitivity: None,
                    resource_kinds: None,
                    network_hosts: None,
                    principal_ids: None,
                },
            }],
            effective_at: "2026-08-02T12:00:00.000Z".into(),
            expires_at: "2099-12-31T23:59:59.999Z".into(),
        };
        let signing_key = fixture_signing_key();
        let env = envelope.sign(&signing_key);
        let pk = signing_key.verifying_key();
        assert!(env.verify(&pk).is_ok(), "policy envelope should verify");
    }

    #[test]
    fn sign_verify_node_identity() {
        let cert = NodeIdentityCertificate {
            node_id: "node-001".into(),
            operator_id: "operator-001".into(),
            workspace_id: "workspace-1".into(),
            public_key: canonical::encode_base64url(
                &fixture_signing_key().verifying_key().to_bytes().as_ref(),
            ),
            issued_at: "2026-08-02T12:00:00.000Z".into(),
            expires_at: "2099-12-31T23:59:59.999Z".into(),
            proof_chain: vec![],
        };
        let signing_key = fixture_signing_key();
        let env = cert.sign(&signing_key);
        let pk = signing_key.verifying_key();
        assert!(env.verify(&pk).is_ok(), "node identity should verify");
    }

    #[test]
    fn sign_verify_revocation() {
        let revocation = RevocationStatement {
            revocation_id: "rev-001".into(),
            grant_id: "grant-001".into(),
            reason: "compromised key".into(),
            revoked_by: "operator-001".into(),
            revoked_at: "2026-08-02T12:00:00.000Z".into(),
            effective_immediately: true,
        };
        let signing_key = fixture_signing_key();
        let env = revocation.sign(&signing_key);
        let pk = signing_key.verifying_key();
        assert!(env.verify(&pk).is_ok(), "revocation should verify");
    }

    #[test]
    fn verify_fails_with_wrong_key() {
        let envelope = SignedCapabilityEnvelope {
            grant_id: "grant-001".into(),
            principal_id: "agent:build".into(),
            actions: vec!["process.execute".into()],
            resources: vec!["*".into()],
            workspace_id: "workspace-1".into(),
            contract_id: "contract-1".into(),
            contract_revision: 3,
            max_uses: Some(10),
            remaining_uses: Some(10),
            delegation_depth: 0,
            expires_at: "2099-12-31T23:59:59.999Z".into(),
            status: GrantStatus::Active,
        };
        let signing_key = fixture_signing_key();
        let env = envelope.sign(&signing_key);
        let mut seed2 = [0u8; 32];
        seed2[0] = 0x99;
        let wrong_key = SigningKey::from_bytes(&seed2);
        let wrong_pk = wrong_key.verifying_key();
        assert!(env.verify(&wrong_pk).is_err(), "should fail with wrong key");
    }

    #[test]
    fn envelope_domain_is_correct() {
        let envelope = SignedCapabilityEnvelope {
            grant_id: "grant-001".into(),
            principal_id: "agent:build".into(),
            actions: vec!["process.execute".into()],
            resources: vec!["*".into()],
            workspace_id: "workspace-1".into(),
            contract_id: "contract-1".into(),
            contract_revision: 3,
            max_uses: Some(10),
            remaining_uses: Some(10),
            delegation_depth: 0,
            expires_at: "2099-12-31T23:59:59.999Z".into(),
            status: GrantStatus::Active,
        };
        let signing_key = fixture_signing_key();
        let env = envelope.sign(&signing_key);
        assert_eq!(env.domain, DOMAIN_SIGNED_CAPABILITY);
    }

    #[test]
    fn envelope_signature_is_deterministic() {
        let envelope = SignedCapabilityEnvelope {
            grant_id: "grant-001".into(),
            principal_id: "agent:build".into(),
            actions: vec!["process.execute".into()],
            resources: vec!["*".into()],
            workspace_id: "workspace-1".into(),
            contract_id: "contract-1".into(),
            contract_revision: 3,
            max_uses: Some(10),
            remaining_uses: Some(10),
            delegation_depth: 0,
            expires_at: "2099-12-31T23:59:59.999Z".into(),
            status: GrantStatus::Active,
        };
        let signing_key = fixture_signing_key();
        let env1 = envelope.sign(&signing_key);
        let env2 = envelope.sign(&signing_key);
        assert_eq!(env1.signature, env2.signature, "signatures should be deterministic");
    }
}