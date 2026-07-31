# Subagent Virtual Window — Inline Session View (Final)

> **For Hermes:** Execute task-by-task. Every patch verified unique.

**Goal:** Subagent entries show only static label. Add inline virtual window showing child session messages (tool calls, responses) when expanded. Grok-style live subagent view.

**Architecture:** Add `sync.ensureChildMessages(sessionID)` to load child session on expand. Render messages in compact text rows inside a `scrollbox`. Messages stream live via existing `message.updated` sync events.

---

## Pre-Fix Audit — All Issues

| Issue | Location | Severity | Fix |
|---|---|---|---|
| Missing `createEffect` import | spine-entry.tsx:2 | Critical — won't compile | Add to solid-js import |
| `ensureChildMessages` needs `sdk` + `hydratingSessions` | sync.tsx | Verified — both in closure ✅ | None |
| `scrollbox maxHeight` | spine-entry.tsx | Verified — SubagentFooter uses it ✅ | None |
| `useSync()` inside component body | spine-entry.tsx:~110 | ✅ Already at top level | None |
| Messages stream for non-active sessions | sync.tsx:326 | ✅ Events store by any sessionID | None |
| Memory: unlimited child messages | spine-entry.tsx | Acceptable — same as parent sessions | None |
| Multiple agent entries same page | spine-entry.tsx | ✅ Each has unique source.sessionID | None |

---

## Tasks

### Task 1: Add `createEffect` import

**File:** `spine-entry.tsx` — line 2
```
old: import { For, Show, createMemo, createSignal } from "solid-js"
new: import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
```

---

### Task 2: Add `ensureChildMessages` to sync context

**File:** `sync.tsx` — after line 785 (after `loadOlder`, before `bootstrap`)

```
old:       },
      bootstrap,
    }

new:       },
      /**
       * Load messages for a child session not in the current route.
       * Used by agent spine entries to show subagent activity inline.
       */
      ensureChildMessages(sessionID: string) {
        if (hydratingSessions.has(sessionID)) return
        const tracker = { messages: new Set<string>(), parts: new Set<string>() }
        hydratingSessions.set(sessionID, tracker)
        sdk.client.session.messages({ sessionID, limit: 25 })
          .then((result: any) => {
            setStore("message", sessionID, reconcile(result.data ?? []))
            hydratingSessions.delete(sessionID)
          })
          .catch(() => {
            hydratingSessions.delete(sessionID)
          })
      },
      bootstrap,
    }
```

---

### Task 3: Add virtual window render + load trigger

**File:** `spine-entry.tsx` — after body display section, before `</Show>` that closes the entry content

**3a: Load trigger effect** — after `subagentStatus` memo (~line 129):
```
old:   })

  // Explicit toggle row

new:   })

  // Load child session messages when agent entry expands
  createEffect(() => {
    if (!isAgentEntry() || !expanded()) return
    const source = entry().source
    if (!source?.sessionID) return
    if (subagentMessages().length === 0) {
      sync.ensureChildMessages(source.sessionID)
    }
  })

  // Explicit toggle row
```

**3b: Virtual window** — after body display (after `</Show>` for `hasToolBody() || isAgentEntry()` block):
```
old:           </Show>

          <Show when={hasReceipt()}>

new:           </Show>

          {/* Subagent virtual window — child session messages inline */}
          <Show when={isAgentEntry() && expanded() && subagentMessages().length > 0}>
            <box paddingLeft={padLeft()} paddingTop={1} flexShrink={0}>
              <scrollbox maxHeight={8} stickyScroll={true} border={["left"]} borderColor={(t.spineContext ?? t.textMuted) as any}>
                <For each={subagentMessages()}>
                  {(msg) => {
                    const item = msg as any
                    const isTool = item.role === "tool"
                    const text = isTool
                      ? `△ ${item.toolName ?? "tool"}`
                      : (item.content ?? "").replace(/\s+/g, " ").trim()
                    return <text fg={isTool ? ((t.spineContext ?? t.textMuted) as any) : (t.text as any)} wrapMode="none">{text}</text>
                  }}
                </For>
              </scrollbox>
            </box>
          </Show>

          <Show when={hasReceipt()}>
```

---

### Task 4: Build + verify

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8.
