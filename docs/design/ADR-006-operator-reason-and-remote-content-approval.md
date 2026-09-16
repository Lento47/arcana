# ADR-006: Operator Reason on Gated Tool Calls + Remote-Content Approval

**Status:** Accepted — 2026-09-15
**Scope:** Authority Kernel — PDP admission semantics, tool schemas, approval surface
**Supersedes:** the hard-deny branch of `DENY_REMOTE_CONTENT_INJECTION` in the PDP path

## Context

Two gaps surfaced while using the governed TUI:

1. **MCP was a dead end.** The built-in `mcp` tool maps to `network.write` and its
   provenance includes `REMOTE_CONTENT`. PDP Step 5.5 (`evaluateIntentBindingLocal`)
   returned a hard `DENY_REMOTE_CONTENT_INJECTION` whenever a remote-content action
   had no exact user-bound intent binding. The designed approval path for this exact
   case — `REQUIRE_APPROVAL_REMOTE_WRITE` in Step 6 — was unreachable, so no prompt
   could ever appear and the model's "approve it in the TUI" guidance was false.
   The approval flow (operator approves → `EXPLICIT_APPROVAL` binding → retry) existed
   and would have worked if the PDP had asked instead of denied.

2. **Approvals carried no "why".** When approval was required, the operator saw the
   tool, action, and request hash, but not the model's stated reason for the call.

Machine-derived provenance cannot distinguish a legitimate remote-content action the
operator intends (use the configured MCP server) from an injected one. That is a
human decision, and the system must ask rather than fail into a dead end.

## Decision

1. **Every model-facing tool declares a required `reason`.** Injected once at the
   single schema projection point (`packages/engine/src/session/tools.ts`,
   `attachToolReason`) so built-in and MCP tools are covered uniformly, then stripped
   before execution so tools and MCP servers never receive it.
2. **The reason is bound into exact-request identity.** `AuthorizationRequest.reason`
   is hashed via the tagged `tool-reason-v1` block (absent ⇒ legacy hash unchanged),
   so an approval binding for a bare request can never authorize a reasoned one.
3. **Operator surfaces show it.** The reason rides `authorization.requested`, the
   immutable request snapshot, and the approval gate as a primary `reason` fact.
4. **Model-initiated calls are asked for a reason, but absence never hard-denies.**
   When a reason is missing the PDP records an informational `MISSING_TOOL_REASON`
   notice and the approval gate shows `(not provided)`. The operator gate — remote
   content, risk, provenance — still decides. A hard deny (`DENY_MISSING_TOOL_REASON`)
   was tried and removed: it left the model no recovery path and blocked ordinary
   tool use in practice.
5. **Remote content without a user binding requires approval, not denial**
   (`REQUIRE_APPROVAL_REMOTE_CONTENT`). On approve, the engine creates the
   `EXPLICIT_APPROVAL` binding for the exact request and retries; the remote-content
   check accepts that binding. Remote content still never auto-allows.

## Consequences

- MCP and other remote-content actions become usable through an explicit human gate.
- Approvals now answer "why is the model doing this?" for every gated call.
- `DENY_REMOTE_CONTENT_INJECTION` remains defined for the standalone
  `evaluateIntentBinding` evaluator and historical records, but the PDP no longer
  emits it.
- Tests pinning the old hard-deny posture were updated; new tests cover the reason
  gate, reason hashing, snapshot/event propagation, and the gate fact row.

## Approval

Explicit human approval recorded 2026-09-15 (operator session): "all PDP tools need a
`reason` input … and then approval is next."
