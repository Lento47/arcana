//! ACEP-1 PEP Decision Client
//!
//! Pure, deterministic authorization decision function
//! mirroring `packages/core/src/capability/pdp.ts` and
//! `packages/core/src/capability/pep.ts`.
//!
//! Takes an AuthorizationRequest + grants/policy input,
//! returns ALLOW/DENY with fail-closed semantics.

use crate::request::AuthorizationRequest;

// Decision Types

#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    Allow { reason: String },
    Deny { reason: String },
}

impl Decision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, Decision::Allow { .. })
    }

    pub fn is_denied(&self) -> bool {
        matches!(self, Decision::Deny { .. })
    }
}

// Policy Context Types

#[derive(Debug, Clone)]
pub struct CapabilityGrant {
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

#[derive(Debug, Clone, PartialEq)]
pub enum GrantStatus {
    Active,
    Revoked,
    Exhausted,
    Expired,
}

#[derive(Debug, Clone)]
pub struct PolicyContext {
    pub policy_version: String,
    pub capabilities: Vec<CapabilityGrant>,
    pub explicit_deny_rules: Vec<PolicyRule>,
    pub approval_rules: Vec<PolicyRule>,
    pub workspace_trust: WorkspaceTrust,
}

#[derive(Debug, Clone)]
pub struct PolicyRule {
    pub id: String,
    pub kind: RuleKind,
    pub description: String,
    pub conditions: RuleConditions,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuleKind {
    Deny,
    Approval,
}

#[derive(Debug, Clone, Default)]
pub struct RuleConditions {
    pub actions: Option<Vec<String>>,
    pub provenance: Option<Vec<String>>,
    pub sensitivity: Option<Vec<String>>,
    pub resource_kinds: Option<Vec<String>>,
    pub network_hosts: Option<Vec<String>>,
    pub principal_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WorkspaceTrust {
    Trusted,
    Untrusted,
    Unknown,
}

// Sensitivity Ordering

fn sensitivity_order(label: &str) -> u8 {
    match label {
        "PUBLIC" => 0,
        "INTERNAL" => 1,
        "PRIVATE" => 2,
        "SECRET" => 3,
        _ => 4,
    }
}

fn max_sensitivity(labels: &[String]) -> &str {
    labels
        .iter()
        .max_by_key(|l| sensitivity_order(l))
        .map(|s| s.as_str())
        .unwrap_or("PUBLIC")
}

// Risk Classification

fn classify_risk(action: &str, sensitivity: &[String]) -> &'static str {
    let base = match action {
        "filesystem.read" => "LOW",
        "filesystem.write" => "MODERATE",
        "filesystem.delete" => "HIGH",
        "process.execute" => "HIGH",
        "network.read" => "LOW",
        "network.write" => "HIGH",
        "secret.use" => "HIGH",
        "git.commit" => "HIGH",
        "git.push" => "CRITICAL",
        _ => "MODERATE",
    };

    let max_sens = max_sensitivity(sensitivity);
    if max_sens == "SECRET" && base != "CRITICAL" {
        return "HIGH";
    }
    base
}

// Resource Matching

fn match_resource(selector: &str, resource_kind: &str, resource_path: &str) -> bool {
    match resource_kind {
        "process" => match_executable(selector, resource_path),
        "file" | "directory" => match_file_path(selector, resource_path),
        "network" => match_host(selector, resource_path),
        _ => match_exact(selector, resource_path),
    }
}

fn match_file_path(pattern: &str, target: &str) -> bool {
    let p = normalize_path(pattern);
    let t = normalize_path(target);

    if t.contains("..") || p.contains("..") {
        return false;
    }

    if p == "*" || p == "**" || p == "/*" {
        return true;
    }

    if t.is_empty() {
        return false;
    }

    if p == t {
        return true;
    }

    if p.ends_with("/*") || p.ends_with("/**") {
        let dir = p.trim_end_matches("/*").trim_end_matches("/**");
        return t.starts_with(&format!("{}/", dir));
    }

    if t.starts_with(&format!("{}/", p)) {
        return true;
    }

    false
}

fn match_executable(pattern: &str, target: &str) -> bool {
    if pattern == "*" {
        return !target.is_empty();
    }
    if target.is_empty() {
        return false;
    }
    let p_base = pattern.split('/').last().unwrap_or(pattern);
    let t_base = target.split('/').last().unwrap_or(target);
    p_base == t_base
}

fn match_host(pattern: &str, target: &str) -> bool {
    let p = pattern.to_lowercase();
    let t = target.to_lowercase();

    if p == "*" || p == "**" {
        return true;
    }

    if t.is_empty() {
        return false;
    }

    if p == t {
        return true;
    }

    if p.starts_with("*.") {
        let suffix = &p[1..];
        if !t.ends_with(suffix) {
            return false;
        }
        let prefix = &t[..t.len() - suffix.len()];
        return !prefix.contains('.') && !prefix.is_empty();
    }

    false
}

fn match_exact(pattern: &str, target: &str) -> bool {
    pattern == target
}

fn normalize_path(p: &str) -> String {
    p.replace('\\', "/")
        .replace("//", "/")
        .trim_end_matches('/')
        .to_string()
}

// Request Validation

fn validate_request(req: &AuthorizationRequest) -> Option<String> {
    if req.request_id.is_empty() {
        return Some("missing requestId".to_string());
    }
    if req.principal_id.is_empty() {
        return Some("missing principalId".to_string());
    }
    if req.session_id.is_empty() {
        return Some("missing sessionId".to_string());
    }
    if req.tool.is_empty() {
        return Some("missing tool".to_string());
    }
    if req.action.is_empty() {
        return Some("missing action".to_string());
    }
    if req.resource.kind.is_empty() {
        return Some("missing resource kind".to_string());
    }
    if req.requested_at.is_empty() {
        return Some("missing requestedAt".to_string());
    }
    if req.nonce.is_empty() {
        return Some("missing nonce".to_string());
    }
    if req.schema_version != "1" {
        return Some("unsupported schema version".to_string());
    }
    None
}

// Capability Matching

fn match_capabilities(
    req: &AuthorizationRequest,
    capabilities: &[CapabilityGrant],
    now: &str,
) -> (bool, Vec<String>) {
    let relevant: Vec<&CapabilityGrant> = capabilities
        .iter()
        .filter(|c| c.principal_id == req.principal_id)
        .collect();

    if relevant.is_empty() {
        return (false, vec!["no capabilities for principal".to_string()]);
    }

    for cap in relevant {
        if cap.status == GrantStatus::Revoked {
            return (false, vec![format!("capability {} is revoked", cap.grant_id)]);
        }
        if cap.status == GrantStatus::Expired {
            return (false, vec![format!("capability {} is expired", cap.grant_id)]);
        }
        if cap.status == GrantStatus::Exhausted {
            return (false, vec![format!("capability {} is exhausted", cap.grant_id)]);
        }
        if cap.expires_at <= now.to_string() {
            return (false, vec![format!("capability {} expired at {}", cap.grant_id, cap.expires_at)]);
        }

        if !cap.actions.contains(&req.action) {
            continue;
        }

        if cap.resources.is_empty() {
            continue;
        }

        let resource_path = req.resource.path.as_deref().unwrap_or("");
        let resource_host = req.resource.host.as_deref().unwrap_or("");
        let resource_executable = req.resource.executable.as_deref().unwrap_or("");

        let any_match = cap.resources.iter().any(|selector| {
            match_resource(selector, &req.resource.kind, match req.resource.kind.as_str() {
                "process" => resource_executable,
                "network" => resource_host,
                _ => resource_path,
            })
        });

        if !any_match {
            continue;
        }

        if !cap.workspace_id.is_empty() {
            if let Some(ref ws_id) = req.workspace_id {
                if cap.workspace_id != *ws_id {
                    continue;
                }
            }
        }

        return (true, vec![]);
    }

    (false, vec!["no matching capability found".to_string()])
}

// PEP Decision Function

pub fn decide(
    req: &AuthorizationRequest,
    ctx: &PolicyContext,
) -> Decision {
    if let Some(err) = validate_request(req) {
        return Decision::Deny {
            reason: format!("DENY_INVALID_REQUEST: {}", err),
        };
    }

    for rule in &ctx.explicit_deny_rules {
        if rule_matches(rule, req) {
            return Decision::Deny {
                reason: format!("DENY_EXPLICIT_POLICY: {}", rule.id),
            };
        }
    }

    let (cap_match, cap_reasons) = match_capabilities(req, &ctx.capabilities, &req.requested_at);

    if !cap_match {
        let reason = if cap_reasons.is_empty() {
            "DENY_NO_MATCHING_CAPABILITY".to_string()
        } else {
            cap_reasons.join("; ")
        };
        return Decision::Deny { reason };
    }

    let risk = classify_risk(&req.action, &req.sensitivity);

    if max_sensitivity(&req.sensitivity) == "SECRET" {
        if risk == "HIGH" || risk == "CRITICAL" {
            let has_approval = ctx.approval_rules.iter().any(|r| rule_matches(r, req));
            if !has_approval {
                return Decision::Deny {
                    reason: "DENY_SECRET_MODEL_EXPOSURE: secret sensitivity requires approval for high-risk action".to_string(),
                };
            }
        }
    }

    if ctx.workspace_trust == WorkspaceTrust::Unknown {
        let risk = classify_risk(&req.action, &req.sensitivity);
        if risk == "HIGH" || risk == "CRITICAL" {
            return Decision::Deny {
                reason: "DENY_UNTRUSTED_WORKSPACE: unknown workspace trust for consequential action".to_string(),
            };
        }
    }

    Decision::Allow {
        reason: format!(
            "ALLOW_CAPABILITY_MATCH: request {} authorized for {} on {}",
            req.request_id, req.action, req.resource.kind
        ),
    }
}

fn rule_matches(rule: &PolicyRule, req: &AuthorizationRequest) -> bool {
    if let Some(ref actions) = rule.conditions.actions {
        if !actions.contains(&req.action) {
            return false;
        }
    }
    if let Some(ref principals) = rule.conditions.principal_ids {
        if !principals.contains(&req.principal_id) {
            return false;
        }
    }
    if let Some(ref sensitivities) = rule.conditions.sensitivity {
        if !req.sensitivity.iter().any(|s| sensitivities.contains(s)) {
            return false;
        }
    }
    if let Some(ref resource_kinds) = rule.conditions.resource_kinds {
        if !resource_kinds.contains(&req.resource.kind) {
            return false;
        }
    }
    if let Some(ref hosts) = rule.conditions.network_hosts {
        let host = req.resource.host.as_deref().unwrap_or("");
        if !hosts.iter().any(|h| h == host) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::{CanonicalResource, AuthorizationRequest};

    fn fixture_request() -> AuthorizationRequest {
        AuthorizationRequest {
            schema_version: "1".into(),
            request_id: "req-test-001".into(),
            principal_id: "agent:build".into(),
            session_id: "session-1".into(),
            contract_id: Some("contract-1".into()),
            contract_revision: Some("3".into()),
            criterion_ids: None,
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
            nonce: "nonce-test-001".into(),
        }
    }

    fn fixture_capability() -> CapabilityGrant {
        CapabilityGrant {
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
        }
    }

    #[test]
    fn decide_allows_matching_capability() {
        let req = fixture_request();
        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_allowed(), "should allow: {:?}", decision);
    }

    #[test]
    fn decide_denies_no_matching_capability() {
        let req = fixture_request();
        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny when no capabilities: {:?}", decision);
    }

    #[test]
    fn decide_denies_wrong_action() {
        let req = fixture_request();
        let mut cap = fixture_capability();
        cap.actions = vec!["filesystem.read".into()];

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![cap],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny wrong action: {:?}", decision);
    }

    #[test]
    fn decide_denies_explicit_deny_rule() {
        let req = fixture_request();
        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![PolicyRule {
                id: "deny-process-exec".into(),
                kind: RuleKind::Deny,
                description: "Deny process.execute".into(),
                conditions: RuleConditions {
                    actions: Some(vec!["process.execute".into()]),
                    ..Default::default()
                },
            }],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny explicit rule: {:?}", decision);
    }

    #[test]
    fn decide_denies_revoked_capability() {
        let req = fixture_request();
        let mut cap = fixture_capability();
        cap.status = GrantStatus::Revoked;

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![cap],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny revoked capability: {:?}", decision);
    }

    #[test]
    fn decide_denies_expired_capability() {
        let req = fixture_request();
        let mut cap = fixture_capability();
        cap.expires_at = "2020-01-01T00:00:00.000Z".into();

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![cap],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny expired capability: {:?}", decision);
    }

    #[test]
    fn decide_denies_workspace_mismatch() {
        let req = fixture_request();
        let mut cap = fixture_capability();
        cap.workspace_id = "workspace-other".into();

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![cap],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny workspace mismatch: {:?}", decision);
    }

    #[test]
    fn decide_denies_invalid_request() {
        let mut req = fixture_request();
        req.action = "".into();

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny invalid request: {:?}", decision);
    }

    #[test]
    fn decide_allows_with_approval_rule_for_secret() {
        let mut req = fixture_request();
        req.sensitivity = vec!["SECRET".into()];

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![],
            approval_rules: vec![PolicyRule {
                id: "approve-secret-exec".into(),
                kind: RuleKind::Approval,
                description: "Approve secret process.execute".into(),
                conditions: RuleConditions {
                    actions: Some(vec!["process.execute".into()]),
                    sensitivity: Some(vec!["SECRET".into()]),
                    ..Default::default()
                },
            }],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_allowed(), "should allow with approval rule: {:?}", decision);
    }

    #[test]
    fn decide_denies_secret_without_approval() {
        let mut req = fixture_request();
        req.sensitivity = vec!["SECRET".into()];

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Trusted,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny secret without approval: {:?}", decision);
    }

    #[test]
    fn decide_denies_unknown_workspace_trust() {
        let req = fixture_request();
        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![fixture_capability()],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Unknown,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_denied(), "should deny unknown workspace trust for HIGH risk: {:?}", decision);
    }

    #[test]
    fn decide_allows_low_risk_with_unknown_workspace() {
        let mut req = fixture_request();
        req.action = "filesystem.read".into();
        req.resource = CanonicalResource {
            kind: "file".into(),
            path: Some("/workspace/test.txt".into()),
            host: None,
            executable: None,
            secret_kind: None,
        };

        let ctx = PolicyContext {
            policy_version: "1.0.0".into(),
            capabilities: vec![CapabilityGrant {
                grant_id: "grant-001".into(),
                principal_id: "agent:build".into(),
                actions: vec!["filesystem.read".into()],
                resources: vec!["/workspace/test.txt".into()],
                workspace_id: "workspace-1".into(),
                contract_id: "contract-1".into(),
                contract_revision: 3,
                max_uses: Some(10),
                remaining_uses: Some(10),
                delegation_depth: 0,
                expires_at: "2099-12-31T23:59:59.999Z".into(),
                status: GrantStatus::Active,
            }],
            explicit_deny_rules: vec![],
            approval_rules: vec![],
            workspace_trust: WorkspaceTrust::Unknown,
        };

        let decision = decide(&req, &ctx);
        assert!(decision.is_allowed(), "should allow LOW risk with unknown workspace: {:?}", decision);
    }
}