---
tags: [arcana, proxy, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana proxy auth model

Arcana Proxy is a licensed AI gateway; key minted via device-code OAuth from arcana-site

The Arcana Proxy (`https://proxy-arcana.otnelhq.com`, fallback `https://arcana-proxy.lejzerv.workers.dev`) is a hosted AI gateway authenticated via `Authorization: Bearer <proxy_key>`. The key is a license credential minted two ways: (1) device flow via `arcana console login` where arcana-site (`Lento47/arcana-site`) mints the key and engine writes it to `~/.arcana/proxy_key` + sets `ARCANA_PROXY_KEY`; (2) license-server bind posting OAuth token.

**Why:** Understanding the trust chain between arcana-site, the proxy, and local config is essential for debugging auth and license issues.

**How to apply:** When investigating proxy auth failures, check `~/.arcana/proxy_key` presence and `ARCANA_PROXY_KEY` env. Keyless reachability probes (unauthenticated GET) can verify host uptime without credentials.
