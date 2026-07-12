# Arcana Web Dashboard --- Contract & Receipt (Revised v0.3.0)

> **Contract ID**: `arcana-web-dashboard-v0.3.0`
> **Issued**: 2026-07-11 (revised after codebase review)
> **Status**: Pending

---

## 1. Summary

Build the **remaining dashboard pages** for `arcana.otnelhq.com` --- the Arcana SaaS site. The site already has marketing, auth (Supabase), a basic workspace dashboard, status page, and PayPal credit purchasing. Six sidebar nav items are currently disabled (Sessions, Memory, API Keys, Proxy, Billing, Settings). This project turns 4 of them into working pages + enhances the existing dashboard with usage analytics.

Note: arcana CLI uses **license keys only** --- no API key management needed. The API Keys nav item stays disabled.

**Budget**: $1,000 USD (fixed price)  
**Delivery estimate**: 10--15 business days  
**Payment**: Upon successful delivery and verification

---

## 2. Ecosystem (what already exists)

```
arcana.otnelhq.com  (Cloudflare Pages --- vanilla HTML/CSS/JS + Pages Functions)
       |
       +-- Supabase Auth (JWT)
       +-- proxy.arcana.otnelhq.com  (Cloudflare Worker --- LLM proxy, PayPal, KV store)
       +-- api.arcana.otnelhq.com    (Cloudflare Worker --- license validation)
```

### arcana-site (this repo)
- Marketing homepage, auth page, changelog, status dashboard
- Workspace dashboard (balance $, credits count, requests today)
- Credit purchasing via PayPal (/credits)
- Subscription creation (/api/create-sub)
- **Disabled nav items**: Sessions, Memory, API Keys, Proxy, Billing, Settings

### arcana-proxy (L:\PROJECTS\arcana-proxy)
- LLM proxy: routes /v1/chat/completions, /v1/embeddings, /v1/models
- Auth: Supabase JWT, license keys, trial tokens, admin keys
- Rate limiting: IP (50/min), user (25/min), daily cap by tier
- Billing: PayPal orders, subscriptions, credit balance in KV
- Existing API: /v1/balance, /v1/usage, /v1/health, /v1/pay/*

### arcana-license-server (L:\PROJECTS\arcana-license-server)
- License CRUD: create, validate, activate, status, list, revoke
- 4 tiers: free, pro ($19/mo), team, enterprise
- Machine binding with maxMachines enforcement
- Cloudflare KV + Durable Objects

---

## 3. What's Being Built

| # | Page | Route | What it does | Status Today |
|---|------|-------|-------------|-------------|
| 1 | Dashboard (enhanced) | /workspace | Add cost/token sparklines, model breakdown, recent sessions list | Exists (basic) |
| 2 | Session Browser | /workspace/sessions | Search/filter agent sessions from proxy, expand to see tokens/cost | Disabled |
| 3 | Proxy Config | /workspace/proxy | View balance, daily caps, provider priority list | Disabled |
| 4 | Billing | /workspace/billing | Transaction history, subscription status, invoices | Disabled |
| 5 | Settings | /workspace/settings | Profile, email, theme toggle, notification prefs | Disabled |
| -- | API Keys | /workspace/api-keys | **Not built** --- arcana CLI uses license keys only | Stays disabled |

### New proxy endpoints needed (5 total)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /v1/sessions | Paginated session list per user |
| GET | /v1/sessions/:id | Single session detail |
| GET | /v1/purchases | Transaction/purchase history |
| GET | /v1/profile | User profile settings |
| PUT | /v1/profile | Update profile settings |

### New Pages Functions (3 total)

| Function | Proxy relay for |
|----------|----------------|
| functions/api/sessions.ts | /v1/sessions, /v1/sessions/:id |
| functions/api/billing.ts | /v1/purchases |
| functions/api/profile.ts | /v1/profile GET/PUT |

---

## 4. What's Leveraged (not built from scratch)

- **arcana-site** existing Pages Functions pattern (credits.tsx, etc.)
- **arcana-proxy** existing auth, rate limiting, KV pattern
- **Supabase** session/JWT flow already working
- **Existing workspace HTML/CSS** --- same design system, sidebar, mobile nav
- **Vanilla stack** --- no build step, no framework, no new dependencies

---

## 5. Budget Breakdown

| Item | Amount |
|------|--------|
| Proxy API integration and 5 new endpoints (sessions, purchases, profile) | $350 |
| Sessions page --- search/filter agent history | $250 |
| Billing page --- transactions, subscription, invoices | $150 |
| Settings page --- profile, theme, preferences | $150 |
| Proxy Config page --- balance, limits display | $50 |
| Polish, auth edge cases, deployment dry-run | $50 |
| **Total** | **$1,000** |

---

## 6. Out of Scope (won't be done)

- API Keys page (arcana CLI is license-only)
- Memory/knowledge graph page (too complex for this budget)
- Mobile app / PWA
- Multi-user/team features beyond single user
- Payment flow changes
- Auth chain modifications
- Provider proxy logic changes
- License server modifications
- Production deployment (dry-run only)
- External analytics SDKs (PostHog, etc.)

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| New proxy endpoints need KV schema design | Follow existing KV prefix conventions (sessions:, purchases: prefixes) |
| Session data not currently tracked | Add session logging to proxy (model, tokens, cost per request) |
| Auth complexity for new endpoints | Reuse existing getUser() auth chain from proxy |
| Vanilla JS complexity at scale | Pages continue pattern of simple HTML + inline JS per page |
| Cloudflare Pages Function limits | All functions are thin auth proxies to the real backend |

---

## 8. Verification Checklist

- [ ] Dashboard shows cost/token sparklines and model breakdown
- [ ] /workspace/sessions lists and searches agent sessions
- [ ] /workspace/billing shows credit purchase history
- [ ] /workspace/settings updates user profile and persists
- [ ] /workspace/proxy displays balance and daily caps
- [ ] API Keys nav item still disabled (intentionally)
- [ ] npx tsc --noEmit passes in arcana-proxy
- [ ] npx wrangler pages deploy --dry-run succeeds

---

## 9. Receipt

```
+----------------------------------------------+
|               ARCANA PROJECT                  |
|           INVOICE / RECEIPT                   |
+----------------------------------------------+
|                                              |
|  Contract:  arcana-web-dashboard v0.3.0      |
|  Issued:    2026-07-11 (revised)             |
|  Payer:     lejze                            |
|                                              |
|  Amount:    $1,000.00 USD                    |
|  Status:    PENDING                          |
|  Terms:     Fixed price per scope above      |
|             Payment on successful delivery   |
|                                              |
|  Target:    arcana-site (primarily)          |
|             + arcana-proxy (minor endpoint   |
|             additions)                       |
|                                              |
|  Signature:  ___________________________     |
|  Date:       ___________________________     |
|                                              |
+----------------------------------------------+
```

---

**Contract file**: .arcana/contracts/arcana-web-dashboard.contract.example.json  
**To accept**: Sign the receipt above and confirm.
