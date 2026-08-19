# Plan: Arcana Workspace (sandbox) + HOME protection

## Goal
Give arcana a dedicated, isolated workspace option so the model does not operate directly in the user's HOME directory, and add a safety net of default permission rules that protect sensitive HOME paths even when a normal project workspace is used.

## Proposed scope (two layers)

### Layer 1: HOME-protection defaults (safety net, all workspaces)
Inject a default permission ruleset that gates tool access under the real HOME directory. This is a non-breaking addition: it only changes the default verdict from `"allow"`/`"ask"` to more restrictive defaults for HOME paths, and user config still overrides it.

Rules to add:
- `read`: allow arcana self-config dirs (`~/.arcana/**`, `~/.config/arcana/**`, `~/.opencode/**`); ask for generic `~/*`; deny sensitive dotfiles (`~/.ssh/**`, `~/.gnupg/**`, `~/.bashrc`, `~/.zshrc`, `~/.profile`, `~/.bash_profile`, `~/.bash_login`, `~/.zprofile`, `~/.zshenv`, `~/.gitconfig`, `~/.netrc`, `~/.aws/**`, `~/.kube/**`).
- `edit`/`write`: same shape, with `deny` for sensitive dotfiles and `ask` for generic home.
- `external_directory`: allow arcana self-config dirs; ask for `~/*`; deny sensitive dotfiles.
- `bash`: allow commands whose resolved paths stay inside the current workspace; ask/deny for paths that touch sensitive home files.

Merge order in `packages/engine/src/agent/agent.ts`:
```ts
const defaults = Permission.fromConfig({ ... })
const homeProtection = Permission.fromConfig({ ... })
const user = Permission.fromConfig(cfg.permission ?? {})
const permission = Permission.merge(defaults, homeProtection, user)
```
Because `user` is merged last, explicit user rules override home protection. Because `homeProtection` is after `defaults`, it wins over the broad `"*": "allow"` default for HOME paths.

### Layer 2: New workspace adapter — `arcana-local`
Add a built-in workspace adapter called `arcana-local` (TUI label: "Arcana Workspace") that creates a self-contained working directory under `~/.arcana/workspaces/<slug>/`.

Behavior:
- Directory is created on first use: `path.join(homeDir, ".arcana", "workspaces", slug)`.
- The slug is derived from a user-provided name or generated.
- The directory becomes `instanceCtx.directory` / `ctx.worktree` for that workspace, so all relative file-tool paths, shell `cwd`, and LSP roots are inside it.
- The shell tool still sees the real `$HOME` env var, but `params.workdir` without an absolute path resolves inside the sandbox; absolute `~` paths are still gated by Layer 1 permission rules.
- No git required — this is a plain local directory, unlike the existing `worktree` adapter.

Files to touch:
1. `packages/engine/src/control-plane/adapters/arcana-local.ts` — new adapter.
2. `packages/engine/src/control-plane/adapters/index.ts` — register `arcana-local` in `BUILTIN`.
3. `packages/engine/src/agent/agent.ts` — add `homeProtection` ruleset and merge it.
4. `packages/engine/src/permission/index.ts` — ensure `expand()` handles `~/.arcana/**` etc. correctly (already does `~/` expansion; verify no regressions).
5. `packages/tui/src/component/dialog-workspace-create.tsx` — no code change needed if adapter list is dynamic; verify the new adapter appears correctly.
6. `packages/core/src/workspace/trust.ts` — ensure the new `~/.arcana/workspaces/**` path is trusted for config loading (or explicitly excluded from executable-config trust, since it is an arcana-managed directory).

### Optional Layer 3: Hard sandbox toggle (deferred)
Add a config/env option `ARCANA_HARD_SANDBOX` that makes `assertExternalDirectoryEffect` fail closed with a typed error instead of asking permission. This is a follow-up after Layers 1 and 2 are proven; it is not in the initial scope because it changes the permission UX from "ask" to "deny" and needs careful rollout.

## Implementation steps

1. **Add HOME-protection ruleset**
   - Read `packages/engine/src/agent/agent.ts` around the `defaults` block.
   - Define `homeProtection` with sensitive-home deny + generic-home ask + arcana self-config allow.
   - Change merge to `Permission.merge(defaults, homeProtection, user)`.
   - Run engine tests (`bun test --filter @arcana/engine`) and adjust any tests that expected unconditional home writes.

2. **Add `arcana-local` adapter**
   - Create `packages/engine/src/control-plane/adapters/arcana-local.ts` implementing `WorkspaceAdapter`.
   - `configure`: resolve/generate directory under `~/.arcana/workspaces/<slug>/`.
   - `create`: `fs.mkdir(directory, { recursive: true })`.
   - `remove`: optionally remove directory if empty; otherwise leave it to avoid data loss.
   - `target`: return `{ type: "local", directory }`.
   - `list`: discover existing sandbox directories under `~/.arcana/workspaces/`.
   - Register in `packages/engine/src/control-plane/adapters/index.ts`.

3. **Trust handling for sandbox dir**
   - Review `packages/core/src/workspace/trust.ts`.
   - Ensure `~/.arcana/workspaces/**` is not accidentally treated as untrusted and therefore blocks config loading.

4. **Tests**
   - Engine permission tests: add cases verifying home writes are now asked/denied by default.
   - Engine workspace adapter tests: add a test creating an `arcana-local` workspace and verifying its directory is used as `instanceCtx.directory`.
   - TUI tests: verify the new adapter appears in the workspace selection dialog (if tests exist for adapter list).

5. **Integration / build**
   - `bun run build`
   - `bun test --filter @arcana/engine`
   - `bun test --filter @arcana/tui`

## Trade-offs
- **HOME redirect vs. permission gating**: We do not redirect `$HOME` to the sandbox directory because that breaks external tools that legitimately need the real home (e.g., git reading `~/.gitconfig`, ssh keys). Instead we use Layer 1 permission rules as the safety net and Layer 2 as the preferred workspace.
- **Sensitive-home deny**: Denying `~/.ssh/**`, `~/.gnupg/**`, shell profiles, etc. by default prevents accidental model damage, but a user can still override with explicit `permission.edit: { "~/.ssh/config": "allow" }` if they really want.
- **Arcana self-config allow**: arcana still needs to read/write its own `~/.arcana/**` and `~/.config/arcana/**`; these are whitelisted.
- **No hard sandbox in v1**: We keep the existing "ask" behavior for non-sensitive external directories so we don't break existing workflows that read files from `~/Downloads`, `~/Documents`, etc.

## Risks
- Existing tests may expect unconditional home writes; they will need updating.
- Users with no config may suddenly see permission asks for home-path operations; this is the intended behavior change.
- The `arcana-local` workspace introduces a new directory lifecycle; we must avoid deleting user data on workspace remove.
