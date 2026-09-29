# QUARANTINE — Unverified Learnings

> Entries held pending verification.
> Use `promote(runId)` to promote or `discard(runId)` to delete.

## ses_fbfadaac9ffeOfVnNof9RXuVTm
date: 2026-08-26

- [[failed-to-request-permissions-when-tool-constrained]] (Mistakes) — Assistant described tool constraints instead of asking for permissions/setting goal to unlock tools
## ses_fbac982d6ffebcaiMIiwY8Mejc
date: 2026-08-28

- [[tui-diff-hang-root-cause-unbounded-rendering]] (Project) — TUI /diff indefinite hang is client-side unbounded rendering, not server VCS timeout
- [[vcs-diff-timeout-hierarchy]] (Project) — SDK customFetch 30s only for mutating verbs; GET vcs.diff has no transport timeout
- [[opentui-diff-treesitter-async-highlighting]] (Project) — OpenTUI <diff> uses async treeSitterClient with _waitingForHighlight, not main-thread blocking
- [[agents-md-system-reminder-injection]] (Project) — read tool auto-appends nearest AGENTS.md as system reminder, not file content
- [[two-layer-vcs-timeout-defense]] (Patterns) — Bound git stalls with server 12s Effect.timeout < client 15s AbortController race
- [[windowing-diff-file-rendering]] (Patterns) — Cap unbounded <For each={visiblePatchFiles()}> with renderedPatchFiles.slice(0,50)
- [[assuming-server-timeout-fixes-indefinite-freeze]] (Mistakes) — Treating 12s server Vcs.diff bound as definitive fix for >15s TUI freeze
- [[misattributing-freeze-to-treesitter-sync]] (Mistakes) — Assuming OpenTUI <diff> Tree-sitter highlighting blocks main thread
## ses_fb3f84929ffenopd0YzUdH5nU9
date: 2026-08-29

- [[tui-architecture-exploration]] (Project) — The arcana TUI's architecture requires understanding routes, commands, keymaps, and dialogs before adding new features.
- [[user-rejected-gantt-dashboard]] (Project) — The user rejected the Gantt timeline dashboard implementation in the TUI and asked for it to be removed.
- [[explore-before-building-tui]] (Patterns) — When adding features to the arcana TUI, explore routes, commands, keymaps, and dialogs first.
- [[built-without-confirming-requirements]] (Mistakes) — The assistant built a full Gantt dashboard component before confirming the user actually wanted it.
## ses_fa534a0b8ffecbIDAava33UHvM
date: 2026-09-01

## ses_fa52c980affeoUPY2HdsfJ8A2o
date: 2026-09-01

- [[arcana-core-identity]] (Project) — Arcana is a governed autonomy runtime with an execution-security kernel, TUI console, and proof system
- [[arcana-tech-stack]] (Project) — Arcana uses Effect + SolidJS + Bun stack with Drizzle ORM and Hono
- [[arcana-phase-d-progress]] (Project) — Phase D distributed governance is largely implemented with specific work packages
- [[arcana-maturity-assessment]] (Project) — Arcana is pre-1.0, Phase D still in progress, TUI-2.1 freeze not authorized
## ses_f85413715ffetFZbWq1lX1E2t4
date: 2026-09-07

- [[tui-crash-root-cause-sync-data-race]] (Project) — TUI crashed because UI mounts render eagerly before the async sync context bootstrap finishes, leaving sync.data undefined
- [[spine-prose-caret-timing-test-flaky]] (Project) — The caret blink-interval test in spine-prose (622ms timing) is flaky and fails intermittently
- [[guard-async-bootstrapped-data-with-optional-chaining]] (Patterns) — Use optional chaining on every access to async-bootstrapped context data (sync.data.*, sdk.event), matching the existing directory.ts pattern
- [[rerun-unexpected-failures-before-regression-hunt]] (Patterns) — When a test you didn't touch fails, re-run the suite once before investigating it as a regression
- [[verify-stale-flagged-edits-landed]] (Patterns) — When an edit is flagged [STALE], re-read the file to confirm the change actually applied before proceeding
- [[unguarded-sync-data-access-in-new-code]] (Mistakes) — use-spine-projection.ts and project.tsx accessed sync.data/sdk.event unguarded despite directory.ts already establishing the ?. guard pattern
## ses_f591be0c6ffeOwUoZMDl7R0Tf1
date: 2026-09-16

- [[mcp-permission-system-user-binding]] (Project) — MCP connections require explicit user approval via the PEP; agents cannot bypass DENY_REMOTE_CONTENT_INJECTION
- [[mcp-auto-cancel-possible]] (Project) — MCP connection attempts can be auto-cancelled by policy rules without showing the approval prompt to the user
- [[firecrawl-requires-api-key]] (Project) — Firecrawl MCP needs a FIRECRAWL_API_KEY; anonymous access is blocked for suspicious IPs
- [[cci-revert-threshold-too-high]] (Project) — CCI revert strategy with threshold 308 never triggers because real CCI values max out ~224
- [[mcp-approval-flow]] (Patterns) — Issue MCP connect call so user sees TUI prompt; don't retry blindly if it fails
- [[assumed-user-denied-when-auto-cancelled]] (Mistakes) — Incorrectly told user they clicked 'Deny' when the MCP was actually auto-cancelled by policy
- [[over-attempted-mcp-connection]] (Mistakes) — Tried MCP connect ~6+ times before succeeding; should have diagnosed the block earlier
