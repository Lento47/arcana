# command-spine context

## Subagent card identity (use-spine-projection.ts)

- Resolution order for agent cards: `part.state.metadata.sessionId` (mapper `taskToolSessionID`, stamped while running) → child title match `@<agent> subagent` → newestChild fallback **only when unstamped entries == 1 && children == 1**. Blanket newestChild stamping with multiple same-agent children (retry waves create duplicate titles) made every card mirror one child's stream.
- Retry waves legitimately create same-titled sibling children; title matching keys on agent name only and cannot disambiguate them.

## Card states (spine-entry.tsx subagent panel)

- The "Working in the … context" line is a FALLBACK shown only while `streaming` with empty live output (`preliminaryToolOutput` requires `status==="running"` + string output). Cancelled/pending tasks render no working panel — keep state wording distinct or cards read as duplicated messages.
- Task parts cancelled by turn cleanup (sibling failed → wave cancelled) still render as agent entries; derive liveness/badge from `part.state.status`, never from child heartbeat alone.
- The delegation renders as a WHOLE BLOCK CARD (full `RoundBorder` + `backgroundPanel` fill), not a rail line: a title strip (`delegated`/`returned` · steps · right-aligned `↵ open` badge) with the body underneath. The rail column stays blank so the card aligns under the header chip; elapsed lives in the header chip only. The live ticker shows the newest `LIVE_OUTPUT_LINES` (2) lines — newest brightest, `…` on the clipped first — the returned step list caps at `MAX_CARD_STEPS` (6) with a `… N more steps` tail, and prose inside the card wraps to `contentWidth - railWidth - 4`, never the outer width.
- Collapsed returned cards show a one-line report preview (markers stripped); expanding replaces it with the full markdown body — one-line scan, no duplicate preview.
- `^b background` (session.background) is surfaced only by the focused-card hint, and only while the entry is `streaming` and not already `background` (from `state.metadata.background`) — the hint must not offer a no-op.

## Gates

- `AuthorityGate` non-keyed `<Show>` = fresh `PermissionPrompt` per open, but with MULTIPLE queued permissions the instance persists while `items[0]` swaps — internal stage/selected/error survive the swap unless reset on request-id change.
- `GateFrame` renders inline normally; fullscreen toggle switches to `<Portal>` + absolute positioning.
