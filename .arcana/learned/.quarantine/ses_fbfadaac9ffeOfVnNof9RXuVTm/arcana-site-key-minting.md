---
tags: [arcana, arcana-site, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana site key minting

arcana-site (Lento47/arcana-site) mints proxy key via device-code OAuth flow

`arcana-site` = external console/docs site at `Lento47/arcana-site`. Its `functions/auth/device/token.ts` mints the proxy key during `arcana console login` device flow; engine writes it to `~/.arcana/proxy_key`. No bind roundtrip needed for device flow.

**Why:** This is the trust chain between the console site and the licensed proxy — the site is the token issuer.

**How to apply:** When reviewing auth flow security, trace device-flow handler in arcana-site and the engine's key-write path. License-server bind is the alternative minting path.
