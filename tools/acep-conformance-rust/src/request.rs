//! E4: Rust protocol SDK foundation — canonical AuthorizationRequest hashing.
//!
//! Byte-for-byte port of the TypeScript canonicalizer
//! (`packages/core/src/capability/request-hash.ts`): the same deterministic
//! encoding and domain-separated SHA-256, so cross-language requests hash
//! identically.

use sha2::{Digest, Sha256};

const DOMAIN: &[u8] = b"arcana-authorization-request-v1";

#[derive(Debug, Clone)]
pub struct CanonicalResource {
    pub kind: String,
    pub path: Option<String>,
    pub host: Option<String>,
    pub executable: Option<String>,
    pub secret_kind: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthorizationRequest {
    pub schema_version: String,
    pub request_id: String,
    pub principal_id: String,
    pub session_id: String,
    pub contract_id: Option<String>,
    pub contract_revision: Option<String>,
    pub criterion_ids: Option<Vec<String>>,
    pub workspace_id: Option<String>,
    pub tool: String,
    pub action: String,
    pub resource: CanonicalResource,
    pub executable: Option<String>,
    pub arguments: Vec<String>,
    pub working_directory: Option<String>,
    pub network_destination: Option<String>,
    pub provenance: Vec<String>,
    pub sensitivity: Vec<String>,
    pub requested_at: String,
    pub nonce: String,
}

fn push_u32(out: &mut Vec<u8>, value: usize) {
    out.extend_from_slice(&(value as u32).to_be_bytes());
}

fn push_str(out: &mut Vec<u8>, value: &str) {
    push_u32(out, value.len());
    out.extend_from_slice(value.as_bytes());
}

fn push_str_opt(out: &mut Vec<u8>, value: Option<&str>) {
    match value {
        Some(value) => {
            out.push(0x01);
            push_str(out, value);
        }
        None => out.push(0x00),
    }
}

fn push_str_arr(out: &mut Vec<u8>, values: &[String]) {
    push_u32(out, values.len());
    for value in values {
        push_str(out, value);
    }
}

fn push_label_arr(out: &mut Vec<u8>, values: &[String]) {
    let mut sorted: Vec<String> = values.to_vec();
    sorted.sort();
    push_str_arr(out, &sorted);
}

impl AuthorizationRequest {
    /// Deterministic canonical byte encoding (fixed field order, length
    /// prefixes, sorted label arrays, contract-intent extension).
    pub fn canonicalize_request(&self) -> Vec<u8> {
        let mut out = Vec::new();

        push_str(&mut out, &self.schema_version);
        push_str(&mut out, &self.request_id);
        push_str(&mut out, &self.principal_id);
        push_str(&mut out, &self.session_id);
        push_str_opt(&mut out, self.contract_id.as_deref());

        if self.contract_revision.is_some() || self.criterion_ids.is_some() {
            push_str(&mut out, "intent-contract-v1");
            push_str_opt(&mut out, self.contract_revision.as_deref());
            push_label_arr(&mut out, self.criterion_ids.as_deref().unwrap_or(&[]));
        }

        push_str(&mut out, &self.tool);
        push_str(&mut out, &self.action);

        push_str(&mut out, &self.resource.kind);
        push_str_opt(&mut out, self.resource.path.as_deref());
        push_str_opt(&mut out, self.resource.host.as_deref());
        push_str_opt(&mut out, self.resource.executable.as_deref());
        push_str_opt(&mut out, self.resource.secret_kind.as_deref());

        push_str_opt(&mut out, self.executable.as_deref());
        push_str_arr(&mut out, &self.arguments);
        push_str_opt(&mut out, self.working_directory.as_deref());
        push_str_opt(&mut out, self.network_destination.as_deref());

        push_label_arr(&mut out, &self.provenance);
        push_label_arr(&mut out, &self.sensitivity);

        push_str(&mut out, &self.requested_at);
        push_str(&mut out, &self.nonce);

        out
    }

    /// Domain-separated SHA-256 request hash (hex).
    pub fn compute_request_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(DOMAIN);
        hasher.update(self.canonicalize_request());
        hex::encode(hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> AuthorizationRequest {
        AuthorizationRequest {
            schema_version: "1".into(),
            request_id: "req-fixed".into(),
            principal_id: "agent:build".into(),
            session_id: "session-1".into(),
            contract_id: Some("contract-1".into()),
            contract_revision: Some("3".into()),
            criterion_ids: Some(vec!["ac-1".into(), "ac-2".into()]),
            workspace_id: Some("workspace-1".into()),
            tool: "run".into(),
            action: "process.execute".into(),
            resource: CanonicalResource {
                kind: "process".into(),
                path: None,
                host: None,
                executable: Some("bun".into()),
                secret_kind: None,
            },
            executable: Some("bun".into()),
            arguments: vec!["command=bun test".into()],
            working_directory: Some("/workspace".into()),
            network_destination: None,
            provenance: vec!["USER_INSTRUCTION".into()],
            sensitivity: vec!["INTERNAL".into()],
            requested_at: "2026-08-02T12:00:00.000Z".into(),
            nonce: "nonce-fixed".into(),
        }
    }

    #[test]
    fn request_hash_is_deterministic() {
        let a = fixture().compute_request_hash();
        let b = fixture().compute_request_hash();
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
    }

    #[test]
    fn request_hash_changes_with_any_field() {
        let base = fixture();
        let mut changed = fixture();
        changed.arguments = vec!["command=bun test --changed".into()];
        assert_ne!(base.compute_request_hash(), changed.compute_request_hash());

        let mut changed2 = fixture();
        changed2.contract_revision = Some("4".into());
        assert_ne!(base.compute_request_hash(), changed2.compute_request_hash());
    }

    #[test]
    fn golden_vector_matches_typescript() {
        // Generated from packages/core/src/capability/request-hash.ts for the
        // exact fixture above (E4 cross-language vector).
        assert_eq!(
            fixture().compute_request_hash(),
            "b1e96acf45c7fd998e29679720efb522dfb65463ff8633aae79f8470ed5d4168"
        );
    }
}
