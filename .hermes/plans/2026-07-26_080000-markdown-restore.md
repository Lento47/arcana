# Subagent Body — Restore Markdown Rendering

> **For Hermes:** Execute task-by-task after approval. Every patch verified unique.

**Goal:** Two issues: (1) Markdown syntax (`**bold**`, `###`, `` `code` ``) shows as raw text in subagent body — I blocked `SpineProse` for agent entries, which handles rich text rendering. (2) `│` border characters leak into content area.

---

## Regression Analysis

**REG-1: SpineProse blocked for agent entries.** My `!isAgentEntry()` at line 457 prevents markdown rendering. All bold/headers/code show as raw syntax. **Fix: make sections mutually exclusive: XML → section 1, no XML → section 2 (SpineProse).**

**REG-2: Section 1 fires for ALL agent entries.** Even when body has no XML, plain text is rendered via `<For each={splitLines()}>` — no markdown. **Fix: gate section 1 on XML detected (`taskState || activeGoal || taskResult`).**

**REG-3: `│` border leak.** Likely from the subagent virtual window scrollbox at line 404: `border={["left"]}` — the left border is rendered WITHIN the content area, not outside it. **Fix: move border to parent box.**

---

## Tasks

### Task 1: Make body sections mutually exclusive

**File:** `spine-entry.tsx`

**1a:** Add `hasBodyXml` memo after `nodeSummary` (line 221), before `let suppressNextFocusMouseUp`:
```
old:   }

  let suppressNextFocusMouseUp = false

new:   }

  const hasBodyXml = createMemo(() => {
    const raw = entry().body || nodeSummary()
    return /<task\s|<active-goal>|<task_result>/.test(raw)
  })

  let suppressNextFocusMouseUp = false
```

**1b:** Gate section 1 on XML detected. Replace condition at line 374:
```
old:           <Show when={!isThink() && (hasToolBody() || isAgentEntry()) && bodyExpanded()}>

new:           <Show when={!isThink() && (hasToolBody() || isAgentEntry()) && bodyExpanded() && hasBodyXml()}>
```

**1c:** Remove `!isAgentEntry()` from section 2, add `isAgentEntry()` to condition, and use live summary for agent body text:
```
old:           <Show when={hasToolBody() && bodyExpanded() && !entry().table && !hasListing() && !isAgentEntry()}>

new:           <Show when={(hasToolBody() || isAgentEntry()) && bodyExpanded() && !entry().table && !hasListing() && !hasBodyXml()}>
```

**1d:** Change SpineProse text to use live summary for agent entries (line 463):
```
old:                   text={entry().body!}

new:                   text={isAgentEntry() ? (entry().body || nodeSummary()) : entry().body!}
```

### Task 2: Fix border leak (unchanged)

### Task 3: Build + verify (unchanged)

**File:** `spine-entry.tsx` — line 404

Move border from scrollbox to parent box:
```
old:               <scrollbox maxHeight={8} stickyScroll={true} border={["left"]} borderColor={(t.spineContext ?? t.textMuted) as any}>
new:               <scrollbox maxHeight={8} stickyScroll={true}>
```
and add border to parent:
```
old:             <box paddingLeft={padLeft()} paddingTop={1} flexShrink={0}>
new:             <box paddingLeft={padLeft()} paddingTop={1} flexShrink={0} border={["left"]} borderColor={(t.spineContext ?? t.textMuted) as any}>
```

### Task 3: Build + verify

```bash
cd L:/PROJECTS/arcana && bun run build
```
