---
tags: [arcana, arcana-site, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana site purpose

arcana-site (Lento47/arcana-site) is external console/docs site that mints proxy key via device token flow

The 'arcana-site' the user mentioned is the external console/docs repository `Lento47/arcana-site`. Its `functions/auth/device/token.ts` mints the proxy key when user confirms login in browser. Engine writes it to `~/.arcana/proxy_key`. No bind roundtrip needed for device flow.

**Why:** User asked about 'arcana-site' alongside proxy; it's the credential-minting counterpart.

**How to apply:** When tracing Arcana auth chain, arcana-site is the token issuer for device-flow path; distinct from license-server bind path in packages/engine/src/account/license-bind.ts.
