# Operations

**Scope:** the day-to-day release pipeline, the manual fallbacks, and the
production environment glue that is not visible from the source tree. Most
of the time this file is "set and forget" — read it when you are about to
ship a release, when CI is broken in a way the logs do not explain, or
when the `arcana.otnelhq.com` URLs are misbehaving.

The canonical product surface (TUI, engine, SDK) is documented in
`docs/architecture/`. This document only covers the **plumbing**.

---

## Release flow (happy path)

1. Land the change. PR must pass `verify` in `ci.yml` — lint, typecheck,
   test, ML eval, build, and the new `Verify version files agree` step.
2. CI auto-publishes the `latest` build via `.github/workflows/build.yml`
   on every push to master (this is the **preview** channel).
3. When you are ready to ship a real version, run `release.yml` via
   **Run workflow** on master:
   - `dryRun`: leave `false` (set `true` only to print the would-be tag).
   - The action bumps `version` in the 4 publication files and creates a
     `v0.X.Y` tag.
4. Pushing the tag triggers `build.yml` again, gated by
   `startsWith(github.ref, 'refs/tags/v')`. Only the tag run publishes to
   npm / R2 / GitHub Packages. See [Tag semantics](#tag-semantics) for
   the `1c15eb63` lesson.
5. After the tag-run completes, smoke-test:
   ```bash
   npx arcana-ai@latest --version
   arcana --version
   ```
   Both should report the new tag.

---

## Tag semantics

The release process has a sharp edge. The `1c15eb63` commit (a 4-file
bump for v0.3.19) triggered `release.yml` but exited without writing the
npm artifact. The local `package.json` already said `0.3.19`, but the
**tag** was never created, so npm never had a `0.3.19` to serve.

Rule of thumb:

- **Bump + push tag in one PR** — do not separate "bump code" from
  "create tag". The tag is the source of truth for npm.
- If a release is half-done, **revert the bump**, do a clean redo, and
  push a single commit with both the bump and the tag. `release.yml`
  will then create a tag from the post-bump state.
- Verify after the tag-run: `npm view arcana-ai versions --json` should
  include the new version.

---

## Environment variables (CI)

The build pipeline reads ARCANA_-prefixed env vars (canonical post-rebrand).
For back-compat, OPENCODE_-prefixed names are still honored with a
one-time deprecation warning:

| Canonical | Legacy | Purpose |
|-----------|--------|---------|
| `ARCANA_RELEASE` | `OPENCODE_RELEASE` | `1` on tag pushes; empty otherwise. |
| `ARCANA_VERSION` | `OPENCODE_VERSION` | Tag name (e.g. `v0.3.19`) on tag pushes; `0.0.0` on master. |
| `ARCANA_CHANNEL` | `OPENCODE_CHANNEL` | npm dist-tag; auto-set to `latest` for non-prerelease. |
| `ARCANA_BUMP` | `OPENCODE_BUMP` | `major` / `minor` / `patch`; bumps the next preview version. |

Required **secrets** for tag pushes (see
[Signing key](#signing-key)):

- `ARCANA_SIGNING_PRIVATE_KEY` — Ed25519 PEM (PKCS8), base64-encoded.
  **Required**: `build.yml` exits 1 if missing on a tag push.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — R2 upload.
- `NPM_TOKEN` — npmjs.org publish; Classic Automation token (the new
  granular tokens lack the `publish` legacy scope).
- `GITHUB_TOKEN` — auto-provided; do not set manually.

---

## Manual npm publish fallback

If the tag-run's `Publish to npmjs.org` step fails, retry locally. The
private `Lento47/arcana` repo is the only place with the credentials and
the wrapper metadata in sync.

```bash
cd "L:/PROJECTS/arcana/packages/arcana/npm"
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> .npmrc
npm publish --access public
rm .npmrc
```

Notes:

- Always publish from the **post-bump** tree (the commit the tag points
  at), not a fresh `master` checkout.
- The wrapper package's `package.json` deliberately **omits**
  `repository` and `homepage`. Re-adding them causes npm to auto-correct
  to the public `Lento47/arcana-community` URL on install — which leaks
  the private repo's existence.
- Confirm with `npm view arcana-ai@<version>` that the version landed.

---

## Signing key

The release artifacts (`.sha256` + `.sig` per binary) are signed with
an Ed25519 key whose **public half is embedded in
`packages/arcana/npm/bin/arcana.js`**. The launcher refuses to upgrade
to a build whose signature does not verify.

Rotation:

1. Generate a new key pair (PKCS8 PEM).
2. Replace the public key in `bin/arcana.js`.
3. Replace the secret in `ARCANA_SIGNING_PRIVATE_KEY` (Settings →
   Secrets → Actions).
4. Bump the wrapper `bin/arcana.js`; the next release will then re-sign
   all checksums.

The private key is **never** stored in the repo, on disk outside the
CI runner, or in any tag. Rotate if you suspect compromise; do not
commit a revocation.

---

## Proxy & license workers

Two separate Cloudflare Workers, both reached via `*.workers.dev`
because `arcana.otnelhq.com` is not always reachable from sandboxes:

- **`arcana-proxy`** — LLM proxy; tier routing (free / Pro / enterprise
  unlimited), priority-list failover across upstream providers.
- **`arcana-license`** — license + proxy-key issuance, validation, and
  revocation. Backed by a Cloudflare KV namespace.

Important gotchas:

- `wrangler pages secret put` does **not** take effect immediately —
  secrets become available on the **next deploy**, not at secret-set
  time. Trigger an empty commit or `wrangler pages deploy` after
  rotating.
- `wrangler deployments list` is the source of truth for "is the
  current `main` actually deployed?" — `git push` to a Pages
  repository is not enough; the build may be queued.
- `arcana-proxy` Workers Builds may not auto-deploy on push. After
  landing a change, verify with `wrangler deployments list` and
  `wrangler deploy` if the latest deployment is stale.

### License key shape

`proxy_key` files are persisted at `~/.config/arcana/credentials/`. The
file is **both** the license and the proxy bearer — do not split them.
Server side: each key is a `LicenseID` row in the KV namespace, with
`tier`, `workspaceID`, and `quota` metadata.

---

## `*.otnelhq.com` URL policy

The following URLs are **intentionally dead** and must not be used
in code, docs, or telemetry:

- `api.arcana.otnelhq.com` — legacy license endpoint; superseded by
  `api-arcana.otnelhq.com`.
- `arcana.otnelhq.com/auth/callback` — old OAuth callback. New
  flow uses the console at `arcana.otnelhq.com`.
- `proxy.arcana.otnelhq.com` — dot-form proxy host; fails TLS, never use.
- `app.opencode.ai` — legacy web UI upstream; superseded by
  `arcana.otnelhq.com`.

The following URLs are **live** and the only allowed surface:

- `https://arcana.otnelhq.com` — marketing / docs (Cloudflare Pages).
- `https://arcana.otnelhq.com/pricing/` — Arcana Pro pricing page.
- `https://arcana.otnelhq.com/pro/workspace/<workspaceID>` — per-workspace
  Pro settings (from the retry upsell action).
- `https://proxy-arcana.otnelhq.com` — AI Gateway API (canonical;
  health check at `/healthz`).
- `https://api-arcana.otnelhq.com/api` — license server API (canonical).
- `https://arcana-proxy.lejzerv.workers.dev` — AI Gateway fallback origin.
- `https://arcana-license-server.lejzerv.workers.dev` — license server
  fallback origin.

In sandbox / CI environments where `*.otnelhq.com` is unreachable, use
the `*.workers.dev` URLs directly. They are functionally identical.

---

## `[bump]` commit mechanism

Empty commits whose subject line is exactly `[bump]` trigger a version
bump via `release.yml`. The actual bump is computed in
`packages/script/src/index.ts` (see `VERSION` resolution) and applied
to the 4 publication files.

Rules:

- `[bump]` — patch bump (default).
- `[bump minor]` — minor bump.
- `[bump major]` — major bump.
- Any other subject line is treated as a normal commit and ignored by
  the release pipeline.

This mechanism is **manual**. CI does not auto-bump on schedule; the
author chooses when a release is ready.

---

## Escalation

If `build.yml` is broken in a way that blocks releases and you cannot
fix it within a single working day, do the following:

1. Open a `release-blocker` issue with the failing run URL, the
   exact error, and the SHA that introduced the regression.
2. Notify the on-call via the channel pinned in `.github/TEAM_MEMBERS`.
3. If a tag has been pushed and the run is in a bad state, **do not**
   delete the tag locally and re-push — this re-triggers the full
   pipeline and re-publishes (potentially corrupting) artifacts.
   Instead, push a follow-up commit and re-tag from the post-fix SHA.
</content>
</invoke>
