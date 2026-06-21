---
tags: [ci, deployment, r2, cloudflare, releases, build]
date: 2026-06-21
source: session-r2-pipeline-fix
---

# R2 Release Pipeline — Binary Distribution

**Rule:** Every tagged release uploads 24 binary assets (12 platform archives + 12 checksums) to Cloudflare R2 at `releases.otnelhq.com/arcana/<version>/`. The npm launcher downloads from R2, verifies checksums, and caches locally.

**Scope:** `.github/workflows/build.yml` — R2 upload step. `.github/workflows/release.yml` — version bump + tag creation. `packages/engine/script/build.ts` — binary compilation. `packages/arcana/npm/bin/arcana.js` — launcher download + verify.

## Pipeline Flow

```
Push to master with [bump patch]
        │
        ▼
release.yml: bump version, commit, tag
        │  uses WORKFLOW_TOKEN (PAT) so tag push triggers build
        ▼
build.yml (triggered by tag push):
  1. bun install (cross-platform)
  2. Build 12 platform variants (linux/darwin/windows × arm64/x64 × baseline/musl)
  3. Create GitHub Release + upload 24 assets
  4. Upload to R2: packages/engine/dist/arcana-* → arcana-releases/arcana/<v>/
  5. Publish to npm (arcana-ai@<version>)
  6. Publish to GitHub Packages
```

## Key Fixes Applied

| Problem | Fix |
|---|---|
| Glob `./arcana-*` at repo root, files in `packages/engine/dist/` | Changed to `packages/engine/dist/arcana-*` |
| `wrangler r2 object put` without `--remote` | Added `--remote` flag |
| `github.token` pushes don't trigger downstream workflows | PAT in `WORKFLOW_TOKEN` secret |
| `[bump patch]` regex didn't match | Added `\[bump patch\]` to patterns |
| Invalid `--account-id` flag for `wrangler r2` | Removed, rely on `CLOUDFLARE_ACCOUNT_ID` env var |

## Launcher Flow (`arcana.js`)

1. Check `~/.arcana/bin/.version` — if cached binary matches, skip download
2. Download `https://releases.otnelhq.com/arcana/<version>/<asset>` 
3. Download `.sha256` checksum
4. Verify SHA-256 hash
5. Extract (tar xzf or unzip) to `~/.arcana/bin/`
6. `chmod +x` on Unix
7. Write `.version` file
8. `spawnSync()` the binary

## Platform Map

| Platform | Asset | Binary |
|---|---|---|
| linux-x64 | `arcana-linux-x64.tar.gz` | arcana |
| linux-arm64 | `arcana-linux-arm64.tar.gz` | arcana |
| darwin-x64 | `arcana-darwin-x64.zip` | arcana |
| darwin-arm64 | `arcana-darwin-arm64.zip` | arcana |
| win32-x64 | `arcana-windows-x64.zip` | arcana.exe |
| win32-arm64 | `arcana-windows-arm64.zip` | arcana.exe |

## History

- 2026-06-20: R2 was empty despite 14+ GitHub Release assets. Three bugs: wrong glob path, missing `--remote`, empty `CLOUDFLARE_ACCOUNT_ID`. Fixed and verified at v0.2.33.
- 2026-06-21: Release workflow PAT fix enabled tag pushes to trigger build workflows. Previously tags from CI were invisible to downstream workflows.

## Related

- [[proxy-origin-check]] — Same Cloudflare infra, different security surface
- [[arcana-site-seo-spa]] — The site that documents releases at `/changelog`
