---
tags: [arcana, proxy, auth]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana proxy key minting

Arcana proxy key minted via device-code OAuth from arcana-site, stored at ~/.arcana/proxy_key

**Why:** User referenced checking proxy and arcana-site; investigation revealed licensed Arcana Proxy auth uses bearer proxy_key minted by arcana-site device-flow (Lento47/arcana-site) and written to ~/.arcana/proxy_key / env ARCANA_PROXY_KEY.

**How to apply:** When working with Arcana licensed proxy, expect key absent in fresh env; keyless reachability probe possible; for full live check need credential.
