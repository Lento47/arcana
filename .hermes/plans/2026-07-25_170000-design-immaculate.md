# TUI Design Polish + Goal Output Fix — Combined Plan (Final)

> **For Hermes:** Execute task-by-task. Every old_string verified unique.

**Goal:** 9 visual fixes. 6 files. Every patch has a unique old_string.

---

### Task 1: Drop padEnd + primary tool color

**File:** `spine-node.tsx`

**1a:**
```
old:     return raw.padEnd(w)
new:     return raw
```

**1b:**
```
old:     if (isTool()) return t.spineContext as any
new:     if (isTool()) return t.text as any
```

---

### Task 2: Hide rail for chat entries

**File:** `spine-rail.tsx`

```
old:   const { theme: themeObj } = useTheme()
new:   if (props.kind === "ask" || props.kind === "plan" || props.kind === "ok") return null
  const { theme: themeObj } = useTheme()
```

---

### Task 3: Gutter as empty spacer

**File:** `spine-gutter.tsx`

**3a — replace render:**
```
old:   const indexColor = () => (props.active ? t.text : t.textMuted) as any
  const padded =
    props.index >= 0 && props.index < 100
      ? props.index.toString().padStart(2, "0")
      : String(props.index)
  return (
    <box width={width} flexShrink={0}>
      <text fg={indexColor()}>{padded.slice(0, width).padEnd(width)}</text>
    </box>
  )
}
new:   return <box width={width} flexShrink={0} />
}
```

**3b — remove unused import:**
```
old: import { useTheme } from "../../context/theme"
import { spineGutterWidth, type SpineLayout } from "./spine-types"
new: import { spineGutterWidth, type SpineLayout } from "./spine-types"
```

---

### Task 4: Increase assistant breathing room

**File:** `spine-chat.tsx`

```
old:       paddingLeft={isAssistant() ? 2 : 1}
new:       paddingLeft={isAssistant() ? 3 : 1}
```

---

### Task 5: Header brand underline

**File:** `spine-header.tsx`

```
old:                 <text fg={t.spineBrand as any}>A R C A N A</text>
              </box>
            </Show>
new:                 <text fg={t.spineBrand as any}>A R C A N A</text>
              </box>
              <box border={["bottom"]} borderColor={t.spineBrand as any} />
            </Show>
```

---

### Task 6: Stronger focus highlight

**File:** `spine-chat.tsx`

```
old:     if (focused()) return (t.backgroundElement ?? t.backgroundPanel) as any
new:     if (focused()) return (t.spinePrompt ?? t.backgroundElement ?? t.backgroundPanel) as any
```

---

### Task 7: Add word-wrap to XML output

**File:** `session/index.tsx`

```
old:               <text fg={theme.textMuted}>{limited()}</text>
new:               <text fg={theme.textMuted} wrapMode="word">{limited()}</text>
```

---

### Task 8: Left-align formatted output

**File:** `session/index.tsx`

`<box gap={1}>` appears 3 times (lines 2164, 2519, 2947). Add context:

```
old:         <box gap={1}>
          <Switch>
new:         <box gap={1} paddingLeft={3}>
          <Switch>
```

This combination (gap={1} followed by Switch) is unique at line 2164.

---

### Task 9: Build + push

```bash
cd L:/PROJECTS/arcana && bun run build
git stash && git pull --rebase && git stash pop && git push
```
