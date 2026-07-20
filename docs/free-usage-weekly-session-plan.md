# Arcana free usage — weekly session plan

- **Date:** 2026-07-14
- **Status:** implementation plan
- **Scope:** free usage only

## Decision

Arcana will offer each eligible free user one free-usage session per rolling seven-day period.

| Rule | Value |
| --- | --- |
| Sessions per reset period | 1 |
| Session duration | 60 minutes |
| Turn allowance | 10 turns |
| Per-turn input cap | 16,384 raw input tokens |
| Per-turn output cap | 2,048 output tokens |
| Per-turn provider calls | 1 (idempotent retries reuse the same `turn_id`) |
| Burst limit (IP) | 20 req/min |
| Burst limit (user) | 8 req/min |
| Weekly token aggregate | 200,000 combined in+out tokens per subject-key |
| Weekly reset | 7 days after session activation |
| Activation | First admitted free turn |
| Early exhaustion | Session closes after the tenth admitted turn, the weekly token cap, or the 60-minute window — whichever comes first |
| Unused turns | Expire when the 60-minute session ends |
| Carryover | None (turns, output, and tokens) |

Example: a session activated Monday at 10:00 remains usable until Monday at 11:00 or until its tenth turn, whichever happens first. The next free session becomes available the following Monday at 10:00. Using all ten turns early does not move the reset forward.

Free usage is an independent product allowance. Licensed usage and its entitlement, accounting, and reset behavior are outside this plan. Free-session code must not read or modify licensed-usage counters.

## Definitions

### Free-usage session

A free-usage session is the one-hour allowance granted for the current weekly period. It has its own `free_session_id` and is bound to the Arcana conversation that activates it.

- Closing and reopening Arcana may resume the same free session while it remains active.
- Reopening the same conversation does not create another allowance.
- Creating, deleting, or switching conversations does not reset the allowance.
- A different conversation cannot claim another free session during the cooldown.
- A turn admitted before the one-hour deadline may finish after the deadline, but no new turn may start after it.

### Turn

One turn is one admitted, top-level user action that invokes an Arcana-hosted free model.

The following consume one turn:

- a normal user prompt;
- a slash command that starts an AI run;
- another user-initiated action that starts a hosted model run.

The following do not consume an additional turn:

- tool calls made inside the admitted run;
- model retries for the same admitted run;
- automatic title generation, summarization, or compaction associated with that run;
- local shell commands and interface-only actions;
- duplicate delivery of the same idempotent turn request.

Each turn still needs an internal ceiling for provider calls, tool rounds, input tokens, and output tokens. This prevents one admitted turn from becoming an unbounded hosted-model workload.

## Lifecycle

```text
ELIGIBLE
  |
  | first admitted turn
  v
ACTIVE
  | activated_at = now
  | expires_at   = activated_at + 1 hour
  | reset_at     = activated_at + 7 days
  |
  +-- tenth turn admitted -----------------> EXHAUSTED
  |
  `-- one-hour deadline reached -----------> EXPIRED

EXHAUSTED or EXPIRED
  |
  | wait until reset_at
  v
ELIGIBLE

The session is also EXHAUSTED when `tokensUsed >= FREE_WEEKLY_TOKEN_AGGREGATE (200,000)`, even if turns remain and the hour has not elapsed. The weekly token cap is the cost-control ceiling; it does not reset early on turn exhaustion.
```

The weekly boundary is anchored to `activated_at`, not to the time the tenth turn is used and not to the one-hour expiration time.

## Turn accounting

The authoritative service reserves a turn before dispatching the first provider request.

1. The client supplies a unique `turn_id`.
2. The service checks session identity, conversation binding, duration, weekly reset, and remaining turns atomically.
3. An accepted `turn_id` reserves one turn.
4. All tool-loop and retry requests for that user action reuse the same `turn_id`.
5. A duplicate reservation returns the original decision without consuming another turn.

Failure policy:

- If the provider was not contacted, release the reservation.
- Once provider execution begins, the turn remains consumed even if the stream fails or the user cancels it.
- Automatic retry of a free-limit rejection is forbidden.

This policy protects hosted inference cost while avoiding charges for failures entirely inside Arcana or the admission service.

## Authoritative state

Weekly enforcement requires a stable, non-license user identity. Prefer the Arcana account ID. If anonymous access is added later, an installation identifier can provide only a soft limit because a user can reset local identity.

Use a privacy-preserving subject key derived from the user identity. Do not use email address, raw IP address, or a license key as the quota key.

The authoritative record contains:

```text
subject_key
free_session_id
arcana_session_id
state
activated_at
expires_at
reset_at
turns_used
tokens_used         (combined in+out, settled on completed turns only; hard-capped at FREE_WEEKLY_TOKEN_AGGREGATE)
turn reservations:
  turn_id
  admitted_at
  provider_started
  provider_call_count
  aggregate_input_tokens
  aggregate_output_tokens
```

`turns_remaining` is derived as `max(0, 10 - turns_used)`.
`tokens_remaining` is derived as `max(0, FREE_WEEKLY_TOKEN_AGGREGATE - tokens_used)`.

## Cloudflare design

The hosted proxy should enforce the free allowance before forwarding a request to a model provider. Client-side state is a display cache, not the authority.

Use one SQLite-backed Cloudflare Durable Object per privacy-preserving subject key. It provides a single coordination point for atomic reservation, concurrent-request protection, expiration, and weekly reset.

Do not use the Cloudflare Workers Rate Limiting binding as the ten-turn accounting system. Its counters are intentionally permissive and eventually consistent. It can still protect session-creation and status endpoints from short bursts.

Suggested interface:

### `POST /v1/free-usage/sessions`

Issues or refreshes a short-lived bearer for the selected Arcana conversation and returns the current free status. This call does not activate the weekly session or consume a turn. The first admitted hosted-model request does that atomically.

```json
{
  "arcanaSessionId": "ses_..."
}
```

Response:

```json
{
  "freeSessionId": "free_...",
  "accessToken": "<short-lived free-session bearer>",
  "state": "eligible",
  "activatedAt": null,
  "expiresAt": null,
  "resetAt": null,
  "limit": 10,
  "used": 0,
  "remaining": 10
}
```

For an already active, exhausted, or expired weekly record, the same response contains its authoritative timestamps and counters. A request for a different conversation during the same weekly period returns `free_session_conversation_mismatch`.

### `GET /v1/free-usage/sessions/current`

Returns `eligible`, `active`, `exhausted`, or `expired` plus the authoritative timestamps and turn totals.

### Hosted model request

Every request carries a short-lived free-session bearer and a `turn_id`. On the first provider request for a top-level user action, the proxy atomically activates the weekly session when necessary and reserves or reuses that turn before provider dispatch. The bearer is a free-session access credential, not a license credential.

Successful responses should include the current free status so the client can refresh its display without another request:

```text
X-Arcana-Free-Limit: 10
X-Arcana-Free-Remaining: 7
X-Arcana-Free-Expires-At: <timestamp>
X-Arcana-Free-Reset-At: <timestamp>
X-Arcana-Free-Tokens-Used: <integer>
X-Arcana-Free-Tokens-Limit: 200000
X-Arcana-Free-Tokens-Remaining: <integer>
```

### Rejections

Use HTTP `429` with a stable error code and `Retry-After` where applicable.

| Code | Meaning |
| --- | --- |
| `free_turn_limit_reached` | All ten turns were admitted. |
| `free_session_expired` | The one-hour active window ended. |
| `free_weekly_cooldown` | The user is waiting for `reset_at`. |
| `free_session_conversation_mismatch` | Another conversation tried to use the active allowance. |
| `free_turn_budget_reached` | One turn exceeded its per-turn provider-call, input, or output ceiling. |
| `free_weekly_token_limit_reached` | The user's weekly combined in+out token allowance is used up. |

The response body must include `resetAt`, `expiresAt`, `used`, `remaining`, `tokensUsed`, `tokensLimit`, `tokensRemaining`, and a user-facing message.

## Arcana integration points

The existing `packages/arcana/src/agent/guard.ts` rate limiter counts tool and web calls. It is not the free-turn limiter and should remain separate.

Implement the free path through a dedicated service:

1. Add shared free-usage state and error schemas under `packages/core`.
2. Add a `FreeUsage` Effect service under `packages/engine/src/free-usage`.
3. Register it in the engine application layer.
4. Admit the free turn at the central `SessionPrompt.prompt` boundary before creating or dispatching the hosted-model run.
5. Propagate one turn identifier through all LLM requests belonging to that top-level prompt. The existing `x-arcana-request` header is a useful transport seam, but the server must also enforce per-turn internal budgets.
6. Add a free-provider authentication path that does not depend on `ARCANA_PROXY_KEY` or license activation.
7. Treat all free-usage `429` responses as terminal and expose their structured status to the TUI.
8. Add a status endpoint or event so both TUI shells render the same authoritative allowance.

The deployed Cloudflare proxy implementation is not present in this repository. Its Worker, Durable Object, and Analytics Engine work must be added as a separately deployable package or implemented in the proxy's deployment repository.

## TUI behavior

Before activation:

```text
Free session · 10 turns · 1 hour
```

While active:

```text
Free 3/10 used · 42m remaining
```

After early exhaustion:

```text
Free turns used · resets Mon 10:00
```

After time expiration with unused turns:

```text
Free session ended · 4 unused turns expired · resets Mon 10:00
```

UI requirements:

- Show both turns and time; neither alone describes the allowance.
- Use the server timestamp for reset messaging and update the countdown locally.
- Preserve prompt text when a submission is rejected.
- Do not retry a rejected prompt automatically.
- Refresh status after process restart and after every hosted free turn.
- Display absolute reset date and time after exhaustion or expiration.

## Cloudflare metrics

Emit authoritative operational metrics from the Worker after each state transition:

- `free_session_activated`;
- `free_turn_admitted`;
- `free_turn_completed`;
- `free_turn_failed`;
- `free_turn_rejected`;
- `free_session_exhausted`;
- `free_session_expired`;
- `free_session_reset`.

Allowed dimensions and measurements:

- event and outcome;
- client version and platform;
- coarse model identifier;
- latency;
- turns used and remaining;
- input and output token totals;
- provider-call and tool-round totals;
- rejection reason.

Never send prompts, responses, tool arguments, file paths, repository names, email addresses, API keys, license keys, raw account IDs, or raw IP addresses. Use a rotating HMAC-derived subject only where deduplication is operationally necessary.

Cloudflare metrics are observational. They must not become the source of truth for granting or rejecting a turn; the Durable Object record owns that decision.

## QA plan

Use a fake clock and deterministic identifiers for policy tests.

### Time and allowance

1. The first turn activates the session with `expires_at = activated_at + 1 hour` and `reset_at = activated_at + 7 days`.
2. Ten distinct turns are accepted during the hour.
3. The eleventh distinct turn is rejected before provider dispatch.
4. A turn admitted at 59 minutes 59 seconds may complete after the hour.
5. A new turn at exactly 60 minutes is rejected and unused turns expire.
6. Exhausting turns early does not change `reset_at`.
7. At exactly seven days, the user becomes eligible and the next turn creates a new session.

### Identity and concurrency

1. Reopening the bound Arcana conversation resumes the active free session.
2. Creating a new conversation does not create another allowance.
3. Eleven concurrent unique turn requests admit exactly ten.
4. Replaying the same `turn_id` consumes exactly one turn.
5. An expired or forged free-session bearer is rejected.

### Failure accounting

1. Failure before provider dispatch releases the reservation.
2. Failure after provider dispatch consumes the turn.
3. Client cancellation after provider dispatch consumes the turn.
4. Tool loops and internal retries remain within one turn and stop at the internal budget.

### Interface and privacy

1. Both TUI shells show identical remaining-turn, expiration, and reset values.
2. Rejection preserves unsent prompt text and displays the absolute reset time.
3. Restarting Arcana refreshes authoritative status instead of resetting locally.
4. Metrics contain no prompt content, response content, path, secret, email, raw identity, or license field.
5. Free-usage tests run without setting a license environment variable or contacting a license service.

## Acceptance criteria

The feature is ready when:

- one user can activate only one free session in a rolling seven-day period;
- that session accepts at most ten turns and lasts at most one hour;
- unused turns never carry over;
- conversation creation, process restart, retries, and concurrency cannot create extra turns;
- the eleventh turn and post-expiration turns are rejected before provider cost is incurred;
- the next eligibility time remains exactly seven days after activation;
- free status is visible and understandable in both TUI shells;
- Cloudflare receives privacy-minimized operational metrics;
- free usage has no dependency on licensed-usage state or license validation.

## Non-goals

- Defining or changing licensed usage.
- Converting free counters into licensed counters.
- Sharing reset or entitlement logic with the license system.
- Allowing unused turns to roll over.
- Using telemetry aggregates as the enforcement database.

## Cloudflare references

- [Durable Objects storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)
