---
tags: [arcana, proxy, architecture]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana proxy architecture

Arcana Proxy is licensed AI gateway; key at ~/.arcana/proxy_key / ARCANA_PROXY_KEY

Arcana Proxy is a hosted/licensed AI gateway. Canonical: `https://proxy-arcana.otnelhq.com`, fallback `https://arcana-proxy.lejzerv.workers.dev`. Auth: `Authorization: Bearer <proxy_key>`. Key is minted via device-code OAuth (arcana console login) or license-server bind, written to `~/.arcana/proxy_key` and exposed as `ARCANA_PROXY_KEY`. BYOK (Cloudflare/OpenAI keys) is the alternative path.

**Why:** The proxy is the default licensed path for model access; understanding its auth is critical for security review.

**How to apply:** When checking proxy health, a keyless reachability probe (unauthenticated GET to base) confirms host is up and enforcing auth. Full licensed-snapshot check requires a credential.
