---
tags: [security, proxy, paypal, cloudflare, origin-check]
date: 2026-06-21
source: session-proxy-security
---

# Proxy Origin Check — Subscription Endpoint Protection

**Rule:** The PayPal subscription creation endpoint on the proxy worker is protected by an Origin header check. Only requests from `https://arcana.otnelhq.com` and `localhost` can create subscriptions.

**Scope:** `L:/PROJECTS/arcana-proxy/src/index.ts` — `handleCreateSub()`. `L:/PROJECTS/arcana-site/functions/api/create-sub.ts` — Cloudflare Function proxy.

**Reason:** The proxy worker URL (`arcana-proxy.lejzerv.workers.dev`) was exposed in client-side JavaScript. Anyone could curl the endpoint and create unauthorized PayPal subscriptions. The Function hides the URL from the browser, and the origin check on the proxy worker blocks direct access.

## Architecture

```
Browser                    CF Function                  Proxy Worker
  │                            │                            │
  │ POST /api/create-sub       │                            │
  │─────────────────────────►  │                            │
  │                            │ POST /v1/pay/create-sub    │
  │                            │ Origin: arcana.otnelhq.com │
  │                            │─────────────────────────►  │
  │                            │                            │ checks Origin
  │                            │                            │ ✓ allowed
  │                            │   subscriptionId,          │
  │                            │   approvalUrl              │
  │                            │◄─────────────────────────  │
  │   approvalUrl              │                            │
  │◄─────────────────────────  │                            │

Direct curl → proxy
  │ POST /v1/pay/create-sub
  │ (no Origin header)
  │──────────────────────────────────────────────────────►
  │ 403 {"error":"forbidden","message":"Requests must come
  │      from arcana.otnelhq.com"}
  │◄──────────────────────────────────────────────────────
```

## Implementation

### Proxy Worker (`arcana-proxy/src/index.ts`)
```typescript
async function handleCreateSub(request, env, cors) {
  const origin = request.headers.get("Origin") || ""
  const allowed = origin === "https://arcana.otnelhq.com"
    || /^https?:\/\/localhost(:\d+)?$/.test(origin)
  if (!allowed) return json({ error: "forbidden" }, 403, cors)
  // ... proceed with PayPal subscription creation
}
```

### Cloudflare Function (`arcana-site/functions/api/create-sub.ts`)
```typescript
const upstream = await fetch(`${PROXY}/v1/pay/create-sub`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Origin": "https://arcana.otnelhq.com"  // required for proxy check
  },
  body,
});
```

### Client JS (`arcana-site/public/js/app.js`)
```javascript
const r = await fetch('/api/create-sub', {  // never sees proxy URL
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'pro_monthly' })
});
```

## History

- 2026-06-21: Proxy URL discovered exposed in client JS (returned subscription IDs + approval URLs). Fixed by: (1) Cloudflare Function to hide proxy URL, (2) Origin header check on proxy worker. Both deployed to production.

## Related

- [[arcana-site-seo-spa]] — The site that calls this endpoint
- [[ghost-preview-system]] — Same security-first philosophy applied to TUI

Related: [[arcana-governance-model-location]] [[arcana-shell-execution-goal-gate]] [[arcana-security-model]] [[demo-gated-actions-via-minimal-goal]] [[shell-run-before-binding-goal]] [[arcana-evalcondition-bypass]] [[arcana-audit-baseline]] [[governed-codebase-audit-method]]
