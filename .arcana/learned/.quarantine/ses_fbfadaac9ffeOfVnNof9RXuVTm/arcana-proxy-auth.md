---
tags: [arcana, proxy, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana proxy auth

Arcana Proxy is hosted AI gateway; auth via Bearer <proxy_key> from ~/.arcana/proxy_key or ARCANA_PROXY_KEY

The Arcana Proxy is a licensed hosted AI gateway (canonical https://proxy-arcana.otnelhq.com, fallback https://arcana-proxy.lejzerv.workers.dev). Auth is `Authorization: Bearer <proxy_key>` where the key is a license credential. The key is written to `~/.arcana/proxy_key` and exposed as `ARCANA_PROXY_KEY`. Minted via device-code OAuth (arcana console login) or license-server bind. BYOK alternative uses direct Cloudflare/OpenAI keys.

**Why:** User referenced 'the proxy' as part of their project inspection; understanding auth flow is key to security review.

**How to apply:** When testing proxy connectivity, a keyless unauthenticated GET to proxy base checks reachability. Full licensed-snapshot needs credential.
