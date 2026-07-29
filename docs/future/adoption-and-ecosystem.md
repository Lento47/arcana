# Adoption and Ecosystem

## Adoption thesis

Arcana will not become infrastructure by asking teams to replace their existing agents, model providers, CI systems, or developer tools all at once.

Adoption should begin as an overlay around existing execution, then deepen into enforcement and orchestration.

```text
observe existing work
  → produce evidence
  → evaluate policy
  → require approvals
  → enforce capabilities
  → coordinate execution
  → exchange portable proofs
```

## Initial users

The strongest early users are teams for whom autonomous execution already creates meaningful risk or operational complexity:

- security engineering teams
- platform engineering teams
- infrastructure and release teams
- AI-native software teams running multiple agents
- organizations with regulated software-delivery requirements
- open-source maintainers reviewing agent-generated contributions
- enterprises requiring provider sovereignty or local execution

Arcana should not begin by marketing protocol theory. It should solve concrete pain:

- proving what an agent changed
- preventing unauthorized actions
- resuming interrupted work
- comparing verified outcomes across models
- controlling cost and permissions
- producing evidence for review and audit

## Product-led adoption

### Entry product

The Arcana CLI/TUI demonstrates execution receipts, policy decisions, evidence, and verifier-backed completion in a developer-native experience.

### Embedded adoption

The SDK lets existing products add Arcana controls around selected tools or workflows.

### Organization adoption

A control plane adds shared policies, approval routing, remote execution, artifact governance, and analytics.

### Protocol adoption

Independent systems produce or consume Arcana-compatible proofs without using Arcana's products.

## Open-source strategy

The following should be openly specified and broadly usable:

- protocol schemas
- canonical serialization and hashing
- proof validator
- conformance suite
- policy request and decision types
- capability manifest format
- reference SDK core
- basic local runtime
- example capabilities and verifiers

Commercial differentiation can remain in:

- enterprise fleet management
- hosted artifact and proof storage
- organization-wide policy administration
- compliance reporting
- advanced analytics and calibration
- managed remote execution
- proprietary integrations
- support, deployment, and assurance

The open core must remain useful on its own. A crippled core will not establish trust or protocol adoption.

## Integration priorities

### Tier 1

- MCP
- GitHub Actions
- GitHub Apps
- local shell and filesystem
- VS Code
- popular agent runtimes
- OpenTelemetry export

### Tier 2

- Kubernetes
- Terraform and infrastructure planning
- GitLab CI
- Jenkins
- cloud workload identity
- secret managers
- ticketing and approval systems

### Tier 3

- security platforms
- compliance systems
- deployment platforms
- research workflows
- domain-specific enterprise systems

Each integration should preserve Arcana semantics rather than merely forward logs.

## Capability ecosystem

A capability registry can eventually distribute signed, versioned capability manifests and implementation packages.

Registry metadata should include:

- publisher identity
- capability version
- supported protocol versions
- action and resource schemes
- side-effect and risk declarations
- evidence and verifier support
- sandbox requirements
- security review status
- revocation status
- compatibility test results

The registry must not imply that listing equals safety. Trust decisions remain policy-controlled.

## Verifier ecosystem

Third parties should be able to publish verifiers for:

- tests and builds
- security properties
- deployment health
- benchmark validity
- data quality
- policy compliance
- artifact provenance
- domain-specific acceptance criteria

Verifier records must identify the verifier, version, input evidence, trust assumptions, result, and limitations.

## Workflow ecosystem

Reusable workflows should be versioned execution contracts, not hidden prompt templates.

A workflow package should declare:

- objective template
- required parameters
- capabilities
- resource scopes
- budget profile
- execution graph
- verifier requirements
- expected artifacts
- supported environments
- protocol compatibility
- security and rollback expectations

Organizations should be able to fork, constrain, sign, and internally publish workflows.

## Conformance program

The conformance program should provide:

- machine-readable fixtures
- positive and negative tests
- implementation reports
- protocol-level compliance badges
- compatibility matrices
- fuzz and property-test corpora
- security advisories

Conformance must never be pay-to-pass. Commercial certification may add assurance, but the technical test suite should remain independently runnable.

## Design partners

Before public protocol release, Arcana should recruit a small number of design partners with distinct needs:

1. an agent framework that wants policy and proof
2. a CI or developer platform that consumes RunProof
3. a regulated organization that needs approvals and evidence
4. a security vendor that can provide independent verifiers
5. an open-source maintainer who wants trustworthy agent contributions

The goal is to discover which semantics are genuinely interoperable and which remain Arcana implementation details.

## Protocol governance evolution

### Stewardship phase

Arcana controls the specification while APIs and semantics change rapidly.

### Open proposal phase

External implementers submit proposals, compatibility reports, and threat analyses.

### Multi-implementer phase

Major changes require evidence from multiple implementations and migration plans.

### Independent governance consideration

Only after meaningful adoption should Arcana consider a foundation, consortium, or neutral specification body.

Premature neutrality can slow necessary iteration without creating real legitimacy.

## Business model alignment

Arcana should benefit when protocol adoption grows, without making protocol validity depend on payment.

Potential revenue surfaces:

- Arcana Cloud control plane
- managed execution workers
- enterprise policy and identity integrations
- hosted proof and artifact retention
- compliance and audit products
- premium verifier and workflow catalogs
- fleet analytics and cost optimization
- enterprise support and assurance

The protocol and offline validation remain open and vendor-neutral.

## Ecosystem health metrics

- external SDK installations
- active embedded integrations
- third-party capability publishers
- third-party verifier publishers
- proofs produced outside Arcana products
- proofs consumed outside Arcana products
- conformance-suite implementations
- cross-runtime compatibility success
- protocol proposal participation
- percentage of ecosystem activity independent of Arcana Cloud

## Adoption failure modes

- leading with abstract governance language instead of concrete outcomes
- requiring teams to replace existing agents
- making the cloud mandatory
- publishing unstable schemas as a standard
- confusing telemetry with evidence
- certifying opaque capabilities without meaningful review
- allowing ecosystem packages to bypass local enforcement
- monetizing conformance in a way that undermines trust
