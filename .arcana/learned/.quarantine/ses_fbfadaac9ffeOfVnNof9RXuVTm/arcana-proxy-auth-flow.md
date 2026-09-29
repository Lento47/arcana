---
tags: [arcana, proxy, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana proxy auth flow

Arcana Proxy is licensed gateway; key minted via arcana-site device OAuth or license bind, stored at ~/.arcana/proxy_key.

The Arcana Proxy (https://proxy-arcana.otnelhq.com, fallback https://arcana-proxy.lejzerv.workers.dev) authenticates with Bearer proxy_key. Key is minted by arcana-site (Lento47/arcana-site) device token flow or engine license-bind, written to ~/.arcana/proxy_key and env ARCANA_PROXY_KEY. BYOK alternative uses direct provider keys.

**Why:** Centralized licensed access controls AI gateway usage and ties to console login.

**How to apply:** For live checks, attempt keyless reachability probe first; full licensed snapshot requires user login. Never print secret key; only check presence.
