# Chat Card Off-By-Padding — Text Truncation Fix

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Chat text truncated at right edge ("instructio" from "instructions" — 4 chars lost). SpineChatCard has `paddingLeft={3}` + `paddingRight={1}` = 4 chars, but SpineProse renders at `contentWidth` (not `contentWidth - 4`). Also: `contentWidth` never passed to SpineProse — defaults to 80.

**Root cause:** `bodyWidth = contentWidth = 121`. Card inner area = `121 - 3 - 1 = 117`. SpineProse markdown renders at 121 → 4-char overflow.

---

### Task 1: Compute prose width accounting for card padding

**File:** `spine-chat.tsx` — after `bodyWidth` memo (~line 90)

```
old:   const bodyWidth = createMemo(() => {

new:   const proseWidth = createMemo(() => {
    const w = bodyWidth()
    if (typeof w !== "number" || w < 24) return undefined
    return Math.floor(w - (isAssistant() ? 4 : 2)) // padL + padR
  })
  const bodyWidth = createMemo(() => {
```

### Task 2: Pass `contentWidth` to SpineProse

**File:** `spine-chat.tsx` — line 166

```
old:         <SpineProse
          kind={kind()}
          text={text()}

new:         <SpineProse
          kind={kind()}
          text={text()}
          contentWidth={proseWidth()}
```

### Task 3: Build + verify

```bash
cd L:/PROJECTS/arcana && bun run build
```
