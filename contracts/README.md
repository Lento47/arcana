# Arcana runtime contracts

The files in this directory are the machine-readable interface between the Arcana runtime and its clients, including Arcana Desktop and SDK consumers.

## Authorities

- `approval-api.v1.yaml` — HTTP/OpenAPI surface.
- `events.v1.json` — governance event catalog/schema.

Prose architecture explains intent, but it does not override these artifacts. Runtime handlers, generated clients, fixtures, and examples must agree with the pinned contract revision.

## Change rules

A contract change must be reviewed together with:

1. the runtime schema and handler behavior;
2. generated or pinned client changes;
3. compatibility and protocol-revision decision;
4. conformance tests for success and failure paths;
5. migration or refusal behavior for incompatible clients.

Do not merge a contract-only change that knowingly leaves the runtime or Desktop client incompatible. Do not merge an implementation-only change that adds undocumented request fields, response states, error codes, or event payloads.

## Compatibility

A change is breaking when an existing conforming client can no longer:

- construct a valid request;
- decode a successful response;
- distinguish documented error conditions;
- resume or deduplicate the event stream;
- preserve the approval or proof security invariant.

Breaking changes require a protocol-revision bump and explicit refusal or migration behavior. A version mismatch fails closed for authority commands.

## Approval command requirements

Approval commands must preserve:

- authenticated operator identity derived from server context;
- exact-request binding;
- stale-view or optimistic-concurrency protection;
- expiry, revocation, capability, intent, and policy revalidation;
- zero protected effects for denied or invalid commands;
- machine-readable conflict and authorization errors.

Expected hashes, versions, nonces, or contract revisions are concurrency and binding fields—not authority identity fields—but they must still be declared in the versioned contract.

## Event requirements

Every authoritative event needs:

- durable identity;
- monotonic sequence within its stream;
- stable event type;
- documented payload;
- deterministic deduplication behavior;
- recovery semantics after a gap or restart.

Clients may aggregate presentation, but they may not fabricate, weaken, or silently drop authoritative events.

## Review checklist

- [ ] OpenAPI/JSON syntax validates.
- [ ] Runtime route and payload schemas match.
- [ ] Error codes/statuses match actual handlers.
- [ ] Event types and payloads match actual emitters.
- [ ] Desktop/SDK bindings were regenerated or verified.
- [ ] Protocol revision and compatibility behavior were reviewed.
- [ ] Negative and restart/replay conformance tests pass.
