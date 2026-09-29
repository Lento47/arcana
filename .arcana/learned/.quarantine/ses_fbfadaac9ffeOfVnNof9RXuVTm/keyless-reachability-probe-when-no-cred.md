---
tags: [arcana, proxy, testing]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# keyless reachability probe when no cred

If no proxy key present, perform keyless unauthenticated GET to proxy base for reachability

**Why:** Full licensed-snapshot live check requires credential; but host up/Auth enforcement can be tested without key.

**How to apply:** When asked to check Arcana Proxy health but `proxy_key` absent, use unauthenticated GET to proxy base URL to verify host and auth enforcement.
