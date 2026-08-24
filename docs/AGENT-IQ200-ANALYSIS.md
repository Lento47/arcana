# IQ-200 Agent Architecture Analysis

## Executive Summary

Arcana's agents overthink because the system has **6 interlocking mechanisms that all reward hesitation over action**. Anthropic's own production data (Claude Code, Opus 5 prompting) reveals the exact patterns that produce decisive, loop-free agents. This document maps the gap and provides the architectural fix.

---

## Part 1: Why Arcana Agents Loop

### The Adversarial Verification Trap

Arcana's verifier prompt:
> "Missing evidence, unresolved required criteria, invalid references, or uncertainty require a rejected verdict."

Anthropic's production insight (from Opus 5 prompting guide):
> "Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions, remove them: instructions like these cause over-verification on Claude Opus 5, and removing them reduces wasted tokens with no loss in quality."

**The trap**: Arcana adds an adversarial verifier ON TOP of the model's natural self-verification. The model already checks its work. The verifier then rejects based on conservative heuristics. The agent sees rejection → builds more evidence → re-checks → rejected again → infinite loop.

### The Freeze Without Escape

Arcana's goal lifecycle:
```
goal_set → work → goal_check(complete) → verify → reject → SAME GOAL ACTIVE → MUTATIONS FROZEN
```

Claude Code's approach (from How Claude Code Works):
> "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop: every mistake waits for you to notice it. Give Claude something that produces a pass or fail, and the loop closes on its own."

**The gap**: Claude Code gives the agent a CHECK IT CAN RUN (tests, build, linter). The agent iterates until the check passes. Arcana gives the agent a VERIFIER THAT CAN REJECT (external judgment). The agent can't iterate toward a clear pass/fail signal — it's gambling on a model's opinion.

### Fear-Weighted Prompting

Count across Arcana's prompts:
- "Don't/never/do not": ~15 instances
- "Do/call/use": ~10 instances
- "If X then stop/wait/ask": ~8 instances

Anthropic's best practice (from Prompting Best Practices):
> "Tell Claude what to do instead of what not to do. Instead of: 'Do not use markdown in your response'. Try: 'Your response should be composed of smoothly flowing prose paragraphs.'"

**The result**: The agent's primary mental model is a list of forbidden actions. This produces paralysis.

### Context Window Death Spiral

Anthropic's core insight (from Best Practices):
> "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."

Arcana's verifier sends the full evidence packet (governance events, tool outputs, contract obligations) to a separate model call. This is expensive AND adds context pressure to the main agent session. Each verification attempt inflates the context, degrading the agent's own reasoning quality.

### Delegation Overhead

Arcana's task tool has ~200 lines of capability delegation, permission derivation, session creation, and contract handling. Claude Code's approach:
> "Subagents run in their own context with their own set of allowed tools. They're useful for tasks that read many files or need specialized focus without cluttering your main conversation."

**The gap**: Claude Code spawns subagents as lightweight context-isolated workers. Arcana spawns them as full governance-governed sessions with capability grants, intent bindings, and contract obligations.

### Drive Loop Exhaustion

Arcana's drive system allows 6 continuations before stopping. But the agent doesn't know it has 6 chances. It treats each turn as potentially the last, leading to either:
- Rushing to finish (premature completion claims)
- Over-analyzing to avoid wasting a turn

---

## Part 2: The IQ-200 Agent Architecture

### Core Principle: Agent as Decision-Maker, Not Rule-Follower

The IQ-200 agent has three properties:
1. **Decisive** — picks the best action in one step, doesn't enumerate alternatives
2. **Self-correcting** — catches mistakes during execution, not after
3. **Loop-proof** — tracks what it tried, never revisits the same state

### Architecture: The Execution State Machine

```
┌─────────────────────────────────────────────────────┐
│                  AGENT MIND                          │
│                                                       │
│  INPUT → HYPOTHESIS → SMALLEST ACTION → OBSERVE     │
│    ↑                                          ↓      │
│    └──── ADJUST ←── COMPARE TO GOAL ←── RESULT       │
│                                                       │
│  Loop Detection: [hash(action+input)] → seen set     │
│  State Tracking: {tried: [], learned: [], gap: ""}   │
│  Termination: {max_attempts: 3, clear_criteria: bool}│
└─────────────────────────────────────────────────────┘
```

### Fix 1: Replace Adversarial Verifier with Deterministic Gate

**Current (Arcana)**:
- Agent claims completion → Model verifier reviews evidence → Reject/Approve
- Reject → Agent stuck in same goal

**IQ-200 (Anthropic pattern)**:
- Agent runs a CHECK it can read (test suite, typecheck, build, linter)
- Check returns pass/fail with specific error messages
- Agent iterates until check passes
- No external judgment — just a signal

**Implementation**:
```typescript
// Instead of goal_check → model verifier
// The agent calls: verify(action: "run_tests" | "typecheck" | "build" | "lint")
// The system runs the command and returns structured output:
{
  passed: boolean,
  errors: Array<{ file: string, line: number, message: string }>,
  summary: string
}
```

The agent sees concrete errors and fixes them. No model opinion involved.

### Fix 2: Replace Goal Freeze with Checkpoint Rollback

**Current**:
```
goal_check(complete) → verify → reject → SAME GOAL → FROZEN
```

**IQ-200**:
```
verify(check) → fail → checkpoint_rollback → adjust → verify(check) → pass → done
```

From Claude Code:
> "Before Claude edits a file, it snapshots the current contents. If something goes wrong, press Esc twice to rewind to a previous state, or ask Claude to undo."

**Implementation**: After each failed verification, the agent gets a concrete error. It adjusts its approach and tries again. After 3 failures on the same check, it escalates to the user with a summary of what it tried.

### Fix 3: Action-First Prompting

**Current Arcana prompt**:
> "If the request is ambiguous or a product decision is required, use the question tool. Do not guess."

**IQ-200 prompt**:
> "Make a reasonable assumption and proceed. If your assumption is wrong, you'll discover it during execution and adjust. Only ask the user when two paths would produce materially different code."

From Claude Opus 5 prompting:
> "Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work."

### Fix 4: Trial Log (Loop Prevention)

Every goal maintains a trial log:

```typescript
interface TrialLog {
  goalID: string
  attempts: Array<{
    step: number
    action: string          // what the agent did
    toolCallHash: string    // hash of tool name + args
    result: "pass" | "fail" | "error"
    error?: string          // specific error message
    timestamp: number
  }>
  deduplication: Set<string>  // set of toolCallHash values
}
```

**Deduplication Rule**: Before any tool call, check if `hash(toolName + normalizedArgs)` is in the deduplication set. If yes, the system injects:
> "You already tried this exact action at step N. It resulted in [error]. Choose a different approach."

**3-Strike Rule**: After 3 failed attempts on the same verification check:
1. Stop trying
2. Summarize: "I tried X, Y, Z. All failed because [pattern]. The remaining gap is [specific]."
3. Ask the user for guidance

### Fix 5: Positive Directive Prompts

Replace every "don't" with a "do":

| Current (Fear) | IQ-200 (Action) |
|----------------|-----------------|
| "Do not guess" | "Assume reasonably, verify during execution" |
| "Do not retry the same call" | "After a denial, find an alternative path or report the blocker" |
| "Never commit unless asked" | "Commit after each verified change with a descriptive message" |
| "Do not invent replacement goals" | "After rejection, refine the current goal's evidence" |
| "If ambiguous, ask" | "Make the most likely assumption and proceed" |

### Fix 6: Minimal Verification Footprint

**Current**: The verifier receives governance events, tool outputs, contract obligations, trace health — a massive evidence packet.

**IQ-200**: The verification check is ONE command:
- `bun test` → pass/fail + error output
- `bun run typecheck` → pass/fail + type errors
- `bun run build` → pass/fail + build errors

The agent reads the output, sees exactly what's wrong, and fixes it. No model judgment. No evidence packet. No context inflation.

### Fix 7: Context-Efficient Delegation

**Current**: Capability delegation → session creation → intent binding → contract obligations → grant activation → monitor → collect results

**IQ-200**: Spawn a subagent with its own context window, give it a clear task, get a result back.

From Claude Code:
> "Subagents work in their own context window. A subagent starts fresh unless it's a fork. Either way, the subagent's tool calls stay out of your context, and Claude gets back a summary when the subagent finishes."

### Fix 8: Transparent Budget

**Current**: `checkOrBlock` silently queues the agent when limits are hit.

**IQ-200**: When budget limits are approached, inject a system message:
> "Approaching budget limit for [X]. You have [N] operations remaining. Prioritize the most impactful actions."

The agent can plan around the limit instead of being surprised by a stall.

---

## Part 3: The Complete Prompt Architecture

### System Prompt (replaces build.txt + default.txt)

```
You are Arcana, a decisive coding agent. You act first, verify continuously, and correct forward.

## How You Work
1. Read the request. Form a 1-sentence hypothesis.
2. Pick the SMALLEST action that tests your hypothesis.
3. Execute and observe the result.
4. If wrong: adjust hypothesis, try next smallest action.
5. If right: scale up to full implementation.
6. Verify with the check command the user provided.
7. Done.

## Verification
You have a check command (tests, typecheck, build). Run it after every significant change.
- Pass → you're done
- Fail → read the error, fix the specific issue, re-run
- 3 failures on the same check → summarize what you tried and ask the user

## Loop Prevention
- Never retry an action that failed with the same inputs
- Track what you've tried in this session
- If you're repeating yourself, STOP and reassess

## Goal Discipline
- Set a goal only for multi-step mutation work
- Work until the check passes, then report success with evidence
- After rejection: refine your approach, don't restart from scratch
- After 3 rejections: ask the user for guidance

## Style
- Act decisively. Pick the best option, don't enumerate alternatives.
- Fix forward. Never undo and redo — adjust and continue.
- Show evidence. Run the check and show the output.
- Be concise. One sentence explaining what you did, then move on.
```

### Verifier (replaces the adversarial model verifier)

The verifier is NOT a model call. It's a deterministic check:

```typescript
// The agent calls: verify(action: string)
// The system runs the action and returns:
{
  passed: boolean,
  output: string,        // raw command output
  errors: Array<{        // parsed from output
    file?: string,
    line?: number,
    message: string,
    severity: "error" | "warning"
  }>,
  summary: string        // "3 tests failed" or "All tests passed"
}
```

No model involved. No opinion. Just a signal.

### Goal Lifecycle (replaces the freeze trap)

```
goal_set → work → verify(check) → [pass] → done
                        ↓
                    [fail] → fix error → verify(check) → [pass] → done
                        ↓
                    [fail x2] → fix error → verify(check) → [pass] → done
                        ↓
                    [fail x3] → summarize attempts → ask user
```

No freeze. No adversarial verifier. Just iterative fixing until the check passes.

---

## Part 4: Implementation Roadmap

### Phase 1: Remove the Adversarial Verifier (1 day)
- Replace goal_check's model verifier with a deterministic check runner
- Remove the evidence packet construction
- Remove the goal freeze on rejection
- Add 3-strike escalation

### Phase 2: Rewrite Prompts (1 day)
- Replace build.txt with action-first prompt
- Replace default.txt with positive directives
- Replace beast.txt with streamlined version
- Remove all "don't/never" instructions that aren't security-critical

### Phase 3: Add Trial Log + Deduplication (2 days)
- Implement trial log in session state
- Add tool call hash deduplication
- Add 3-strike rule
- Inject "you already tried this" warnings

### Phase 4: Simplify Delegation (2 days)
- Remove capability delegation for subagents (use session isolation instead)
- Remove intent binding and contract obligations for subagents
- Use Claude Code's pattern: subagent = isolated context + clear task + summary back

### Phase 5: Transparent Budget (1 day)
- Replace silent queuing with explicit budget warnings
- Show remaining budget in system context
- Let the agent plan around limits

---

## Part 5: Measuring Success

### Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Avg tool calls per task | 15-20 | 5-10 |
| Avg verification attempts | 3-5 | 1-2 |
| Loop incidents per session | 2-3 | 0 |
| User corrections per session | 4-6 | 1-2 |
| Context usage per task | 80% | 40% |
| Time to completion | 5-10 min | 2-3 min |

### Loop Detection Metrics
| Metric | Description |
|--------|-------------|
| dedup_rate | % of tool calls that were duplicates |
| retry_rate | % of verification attempts that were retries |
| 3strike_rate | % of tasks that hit the 3-strike escalation |
| false_positive_rate | % of 3-strike escalations that were actually solvable |

---

## Conclusion

The IQ-200 agent isn't smarter — it's **unburdened**. It doesn't spend cognitive cycles on:
- Fear of the verifier
- Planning around the freeze
- Deciding whether to delegate
- Collecting evidence for a model judge
- Tracking budget limits
- Avoiding forbidden actions

Instead, it spends all its cycles on:
- Understanding the problem
- Picking the best action
- Executing and observing
- Fixing forward
- Verifying with a clear signal

The shift is from **adversarial governance** to **collaborative verification**. The system catches real errors (typecheck failures, test failures, build breaks). The agent focuses on quality work. No loops. No hesitation. No fear.
