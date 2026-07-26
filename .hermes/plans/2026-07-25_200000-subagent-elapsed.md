# Subagent Progress — Show Elapsed Time

> **For Hermes:** Execute task-by-task. Every old_string unique.

**Goal:** Subagent entries show "Working" forever with no progress. Fix: show elapsed time so user knows how long subagent has been running.

**Root cause:** Agent entries set `elapsed: ""` (empty). `computeElapsed` is available but unused.

---

### Task 1: Add elapsed time to agent entries

**File:** `spine-mapper.ts` — lines 1883-1896 (subtask) and 1902-1915 (agent)

**Subtask entry (line 1886):**
```
old:         elapsed: "",
new:         elapsed: computeElapsed(assistantDuration, message).str,
```

**Agent entry (line 1905):**
```
old:         elapsed: "",
new:         elapsed: computeElapsed(assistantDuration, message).str,
```

**Verification:** Subagent entries show "Working · 3s" instead of just "Working".

---

### Task 2: Build + local verify

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8. No push.
