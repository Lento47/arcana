---
tags: [arcana, proxy, testing, pattern]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# keyless reachability probe

Probe authenticated service base URL unauthenticated to check liveness and auth enforcement.

For Arcana Proxy, a keyless GET to base URL reveals if host up and enforcing auth without credential.

**Why:** No proxy_key present in env; full licensed check impossible but basic reachability informative.

**How to apply:** When credential absent, perform unauthenticated HEAD/GET to service root to verify availability and auth challenge.
