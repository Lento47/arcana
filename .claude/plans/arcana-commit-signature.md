# Plan: Arcana CLI Commit Signature

## Goal
When Arcana makes a git commit on the user's behalf, append a tasteful signature/trailer that credits Arcana without being noisy, and let the user disable it.

## Background
- Today the only production commit path is `packages/engine/src/cli/cmd/github.handler.ts`, specifically `commitChanges(summary, actor?)`.
- That function calls `git commit -m <summary>` and optionally appends a `Co-authored-by: <actor>` trailer.
- There is no generic `Git.Service.commit()` wrapper and no `arcana commit` subcommand.
- The long-term goal is that any future commit surface (interactive `arcana commit`, PR agent, skill-driven commits) should share the same signature behaviour.

## Options Considered

### A. Minimal trailer (recommended)
```
Co-authored-by: arcana <arcana@arcana.ai>
```
- GitHub/GitLab render it as a co-author avatar.
- Does not invent a non-standard trailer.
- Short, professional, unmistakably Arcana.

### B. Generated-with + co-author block
```
⚡ Generated with arcana · the AI coding agent

Co-authored-by: arcana <arcana@arcana.ai>
```
- Matches Claude Code / Codebuff style more closely.
- The emoji/arcane glyph plays well with Phase 8 voice branding.
- Slightly longer; some users may find it noisy.

### C. Arcane one-liner
```
⧗ Inscribed by arcana
Co-authored-by: arcana <arcana@arcana.ai>
```
- Leans into the arcane personality.
- Risk: non-standard trailers render poorly in some git UIs.

## Recommended Design
Use **Option A as the default signature**, with an optional **branded body line** (Option B) controlled by a richer config enum:

```jsonc
{
  "git": {
    // false | "minimal" | "branded"
    "commit_signature": "minimal"
  }
}
```

- `"minimal"` → only `Co-authored-by: arcana <arcana@arcana.ai>`.
- `"branded"` → body line `Generated with arcana · the AI coding agent` plus the co-author trailer.
- `false` → no signature.
- Default: `"minimal"`.

Signature identity (configurable later, hardcoded for now):
- Name: `arcana`
- Email: `arcana@arcana.ai`

## Implementation Steps

### 1. Add a generic commit helper to `Git.Service`
In `packages/engine/src/git/index.ts`:
- Extend `Interface` with:
  ```ts
  readonly commit: (cwd: string, message: string, options?: CommitOptions) => Effect.Effect<Result>
  ```
- Add `CommitOptions`:
  ```ts
  export interface CommitOptions {
    readonly actor?: string          // existing GitHub actor
    readonly signature?: false | "minimal" | "branded"
    readonly signatureName?: string
    readonly signatureEmail?: string
  }
  ```
- The helper splits the user message into paragraphs by blank lines, then appends trailers in separate `-m` arguments so git records them as trailers (not as part of the subject).
- Guard against duplicate trailers by checking whether the existing message already contains `Co-authored-by:` matching the signature identity.

### 2. Add config-driven default
In `packages/engine/src/cli/cmd/github.handler.ts`:
- Read `Config.Service` once in the handler setup (it already has `ConfigService` available via `Config.layer`).
- Pass `signature: config.git?.commit_signature` into the new `Git.Service.commit` call.
- Keep the `actor` parameter for the GitHub co-author line.

### 3. Update the GitHub handler
Replace the inline `commitChanges` with `gitSvc.commit(...)`:
```ts
const commitChanges = async (summary: string, actor?: string) => {
  await Effect.runPromise(
    gitSvc.commit(ctx.worktree, summary, {
      actor,
      signature: config.git?.commit_signature ?? "minimal",
    })
  )
}
```

### 4. Tests
- `packages/engine/test/git.test.ts` (or new `packages/engine/test/git-commit.test.ts`):
  - `commit` with default signature produces the expected trailer.
  - `signature: false` omits the trailer.
  - `signature: "branded"` includes the body line + trailer.
  - Duplicate trailers are not added if already present.
  - Existing `actor` co-author line is preserved alongside the Arcana trailer.

### 5. Documentation
- Add the `git.commit_signature` option to the config schema docs.
- Mention in the GitHub agent help text that commits are signed by default.

## Files to Change
- `packages/engine/src/git/index.ts` — add `commit` helper and `CommitOptions`.
- `packages/engine/src/cli/cmd/github.handler.ts` — use the helper.
- `packages/engine/test/git.test.ts` (or new file) — unit tests.
- `packages/engine/src/config/*.ts` (optional) — add typed `git` schema if a typed config section exists; otherwise rely on loose `config.git` access.

## Open Questions
1. Do we want the signature to default to `false` for enterprise/managed installs until legal approves? If so, the managed config layer can override it.
2. Should the email be `arcana@arcana.ai` or `noreply@arcana.ai`? Many bots use `noreply`.
3. Should the branded line use the arcane glyph `⧗` or a plain lightning bolt `⚡`?

## Migration / Compatibility
- No breaking change; existing `commitChanges` behaviour is preserved when `signature: false`.
- The `actor` co-author line remains untouched and independent.
