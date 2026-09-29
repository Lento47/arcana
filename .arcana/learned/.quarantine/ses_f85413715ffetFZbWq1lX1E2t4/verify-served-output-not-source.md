---
tags: [nextjs, dev-server, verification]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# verify served output not source

File edits on disk ≠ what the dev server serves — curl the route and check rendered markers (aria/class patterns) to confirm

After editing `page.tsx` to expand all sidebar nav groups, the dev server (turbopack `next dev` on port 3000) kept serving the old output — only 5 nav items and the old single-open aria pattern (1 true / 8 false) — despite the file's mtime showing the edit. Verified by curling the route and grepping for the new aria pattern, which was absent. Also note: a port-3000 server that's already running may be another agent's; don't assume your `next dev` owns it.

**Why:** mtime proves the source changed, not that the compiled/served output changed; stale compiled output under turbopack led to a false "my edits were reverted" conclusion path.

**How to apply:** After any UI edit, curl the page and assert a marker unique to the new code (class name, aria attribute, element count) appears in served HTML. If it doesn't, distinguish: (a) edits reverted on disk (grep the file), (b) stale compiled output (cache-bust/restart dev server), (c) wrong server on the port.
