# command-spine context

## Subagent card identity (use-spine-projection.ts)

- Resolution order for agent cards: `part.state.metadata.sessionId` (mapper `taskToolSessionID`, stamped while running) → child title match `@<agent> subagent` → newestChild fallback **only when unstamped entries == 1 && children == 1**. Blanket newestChild stamping with multiple same-agent children (retry waves create duplicate titles) made every card mirror one child's stream.
- Retry waves legitimately create same-titled sibling children; title matching keys on agent name only and cannot disambiguate them.

## Card states (spine-entry.tsx subagent panel)

- Collapsed subagent rows are a compact strip, not a box: a state glyph (`●` running / `✓` done / `!` cancelled — the header chip already names the actor, so the strip carries progress, not `delegated`/`returned`) · step count · the newest step label as the live activity (a cancelled card with no steps names its reason: `cancelled`, `superseded`, `stale`) · sibling position (`2/5` when the wave has siblings) · a right-aligned `↵ open` badge that is itself the click target (it navigates to the child; the header above does too). Live relay lines and the returned one-line preview render under the strip; **no placeholder body** — a quiet running card is the strip alone, and a settled card with zero signals (no steps, no sibling, no activity, no child link, no preview) hides the strip panel entirely. Five framed one-liners were five empty boxes.
- Task parts cancelled by turn cleanup (sibling failed → wave cancelled) still render as agent entries with `cancelledReason` (`session_cancelled | superseded | recovered_stale`); the strip and the header chip derive `interrupted` (`!`, warning ink) from it, never ✓. Derive liveness/badge from `part.state.status`, never from child heartbeat alone. Errored task parts render as recovery rows but keep `childSessionID` so the failed child's context stays one dive away.
- The full `RoundBorder` + `backgroundPanel` card is EXPANDED-only, where the step list and the report need the frame. The rail column stays blank so the card aligns under the header chip; elapsed lives in the header chip only. The live ticker shows the newest `LIVE_OUTPUT_LINES` (2) lines — newest brightest, `…` on the clipped first — the returned step list caps at `MAX_CARD_STEPS` (6) with a `… N more steps` tail, and prose inside the card wraps to `contentWidth - railWidth - 4`, never the outer width.
- Collapsed returned rows show a one-line report preview (markers stripped) on the strip; expanding replaces it with the full markdown body — one-line scan, no duplicate preview.
- `^b background` (session.background) is surfaced only by the focused-card hint, and only while the entry is `streaming` and not already `background` (from `state.metadata.background`) — the hint must not offer a no-op.

## Gates

- `AuthorityGate` non-keyed `<Show>` = fresh `PermissionPrompt` per open, but with MULTIPLE queued permissions the instance persists while `items[0]` swaps — internal stage/selected/error survive the swap unless reset on request-id change.
- `GateFrame` renders inline normally; fullscreen toggle switches to `<Portal>` + absolute positioning.
