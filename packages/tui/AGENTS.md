# tui package context

## SolidJS / OpenTUI semantics (non-obvious)

- `@opentui/solid` delegates control flow to stock `solid-js`. `<Show>` with non-keyed JSX children compiles children into a getter read *inside* the memo — nothing mounts while falsy (no eager-create crash), and every false→true transition builds a FRESH component instance. But the condition uses boolean equality (`!a === !b`): with multiple queued items, swapping `items[0]` keeps the SAME instance alive while its props-getter silently rebinds to the next item. Reset internal state on `props.request.id` change if a card can outlive its request.
- `createMemo` runs eagerly at creation; memos inside a conditionally-mounted child only run when actually constructed (see Show above).

## SDK error semantics (`@arcana/sdk` client)

- hey-api methods default to `ThrowOnError = false`: non-2xx resolves as `{ error }` — `.catch()` does NOT fire on HTTP failures. It only fires on network errors, the 30s timeout (mutating requests only, see `sdk/js/src/client.ts`), or a `text/html` response (interceptor throws unconditionally).
- Pass `{ throwOnError: true }` when a failure must surface inline; otherwise inspect `res.error` explicitly.

## Optimistic user echoes (`component/prompt/optimistic.ts`, `context/prompt-queue.tsx`)

- EVERY send path must `addOptimisticMessage` synchronously BEFORE any gating/HTTP. Home-send used to be the only pre-POST echo; existing-session sends rendered late until this was fixed.
- `promptQueue.remove(id)` also deletes that entry's optimistic echo. Inside a success batch, call `remove` FIRST, then re-add the echo — add-before-remove deletes what you just restored.
- Echo survives until the real user message has a non-synthetic text part (`realUserMessageHasText`). Don't drop on bare `message.updated`.

## Delivery gate (`context/prompt-queue.tsx`)

- `submit()` parks a send in KV when `recentlyWorking (≤1500ms) && sessionWorking()`. `sessionWorking` includes status `"waiting"` (open permission/question gate) and the post-204 `activeSessions` set. Drains only when the session goes idle; a wedged non-idle status freezes the whole queue. Engine supports mid-turn prompts (`delivery:"steer"`) — prefer steering over parking for operator sends.

## Sync store (`context/sync.tsx`)

- `store.permission` is event-driven ONLY (`permission.asked/routed/replied`) — never REST-reconciled. `permission.routed` must be update-only: inserting on miss resurrects settled gates as unremovable phantoms (nothing else writes this map).
- `refreshGovernance` fingerprints snapshots (proofHash+count+tail id) before deep-reconciling ≤500 merged events; clear the fingerprint in `session.deleted`.
