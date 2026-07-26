# GenericTool — Render Markdown Output as Rich Text

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Agent/subagent tool output shows as raw plain text in GenericTool (session/index.tsx line 2227). Markdown formatting (bold, headers, code) lost. My previous fixes were in spine-entry.tsx — wrong component. Fix: use SpineProse in GenericTool for rich text rendering.

---

### Task 1: Import SpineProse

**File:** `session/index.tsx`

```
old: import { SpineChatCard } from "../shell/command-spine/spine-chat"
new: import { SpineChatCard } from "../shell/command-spine/spine-chat"
import { SpineProse } from "../shell/command-spine/spine-prose"
```

### Task 2: Replace raw text fallback with SpineProse

**File:** `session/index.tsx` — line 2226-2228

Current:
```
            <Match when={true}>
              <text fg={theme.text}>{limited()}</text>
            </Match>
```

Replace with SpineProse set to `"code"` mode by default (maintains existing code display), or `"markdown"` if text looks like markdown. Use `looksLikeMarkdown` from chat-prose:

```
old:             <Match when={true}>
              <text fg={theme.text}>{limited()}</text>
            </Match>

new:             <Match when={true}>
              {((): any => {
                const raw = limited()
                const mode = raw.includes("```") || raw.match(/^#{1,6}\s|^\*\*|^- |^\d+\. /m) ? "markdown" : "code"
                return <box flexDirection="column" gap={0} paddingTop={0}>
                  <SpineProse kind={mode === "markdown" ? "ask" : "run"} text={raw} bodyLabel="output" />
                </box>
              })()}
            </Match>
```

### Task 3: Build + verify

```bash
cd L:/PROJECTS/arcana && bun run build
```
