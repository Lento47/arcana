# command-spine context

## Subagent card identity (use-spine-projection.ts)

- Resolution order for agent cards: `part.state.metadata.sessionId` (mapper `taskToolSessionID`, stamped while running) → child title match `@<agent> subagent` → newestChild fallback **only when unstamped entries == 1 && children == 1**. Blanket newestChild stamping with multiple same-agent children (retry waves create duplicate titles) made every card mirror one child's stream.
- Retry waves legitimately create same-titled sibling children; title matching keys on agent name only and cannot disambiguate them.

## Card states (spine-entry.tsx subagent panel)

- The "Working in the … context" line is a FALLBACK shown only while `streaming` with empty live output (`preliminaryToolOutput` requires `status==="running"` + string output). Cancelled/pending tasks render no working panel — keep state wording distinct or cards read as duplicated messages.
- Task parts cancelled by turn cleanup (sibling failed → wave cancelled) still render as agent entries; derive liveness/badge from `part.state.status`, never from child heartbeat alone.

## Gates

- `AuthorityGate` non-keyed `<Show>` = fresh `PermissionPrompt` per open, but with MULTIPLE queued permissions the instance persists while `items[0]` swaps — internal stage/selected/error survive the swap unless reset on request-id change.
- `GateFrame` renders inline normally; fullscreen toggle switches to `<Portal>` + absolute positioning.
