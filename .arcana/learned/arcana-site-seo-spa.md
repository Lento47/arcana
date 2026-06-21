---
tags: [site, seo, spa, preact, cloudflare-pages, changelog]
date: 2026-06-21
source: session-site-refactor
---

# Arcana Site — SEO + SPA Refactor

**Rule:** `arcana.otnelhq.com` is a Preact SPA with Cloudflare Pages Functions, full SEO metadata, JSON-LD structured data, and a static changelog page. No `#` hash routing — all navigation uses History API.

**Scope:** `L:/PROJECTS/arcana-site/public/` — all static assets. `L:/PROJECTS/arcana-site/functions/` — Cloudflare Pages Functions (SSR).

## Architecture

```
public/
  index.html           — Preact shell, SEO meta, JSON-LD, <noscript> fallback
  css/main.css         — Design tokens + all component styles (extracted from inline)
  js/app.js            — Preact SPA, manual router (no wouter dep), all components
  changelog/index.html — Static release history page
  robots.txt           — allow all, sitemap URL
  sitemap.xml          — 4 URLs: /, /changelog, /credits, /status
  schema/config.json   — Tool schema for MCP/ACP
  _headers             — CSP + security headers per route
  _redirects           — /docs → GitHub, /api → API server

functions/
  api/create-sub.ts    — Proxy subscription endpoint (hides proxy URL)
  credits.tsx          — Buy credits page (SSR, PayPal integration)
  credits/return.tsx   — PayPal return handler
  status.tsx           — System status page
  api/status.ts        — Status API endpoint
```

## SEO Stack

- **Title:** "ARCANA — Proof-Driven AI Engineering Terminal"
- **Meta description:** Terminal-native AI workbench with wiki-style memory
- **Open Graph:** `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`
- **Twitter Card:** `summary_large_image` with matching title/description
- **Structured Data:** JSON-LD `SoftwareApplication` with offers (Community $0, Pro $19/mo, Enterprise Custom)
- **Canonical URL:** `https://arcana.otnelhq.com/`
- **robots.txt:** `Allow: /` with `Sitemap:` directive
- **sitemap.xml:** 4 URLs with changefreq + priority

## SPA Framework

- **Preact 10.24.3** from `esm.sh` CDN
- **Manual router** (15 lines) using History API + Preact state — no wouter dependency (wouter-preact had context compatibility issues)
- **Components:** Header, Hero, Stats, Models, System (6 cards), Start (3 steps), Pricing (3 plans), Footer
- **No `#` hashes** — `NavLink` uses `history.pushState` + smooth scroll
- **Pricing:** Monthly only, no yearly toggle. Pro = $19/mo flat.
- **Subscribe:** Calls `/api/create-sub` (CF Function) → proxy worker → PayPal
- **Changelog:** Static page at `/changelog` with full release history v0.2.0–v0.2.33

## CSP Headers

- Root (`/`): `script-src 'self' 'unsafe-inline' https://esm.sh`
- `/changelog`: `script-src 'none'` (static, no JS needed)
- `/credits`: `script-src 'self' 'unsafe-inline'` (PayPal integration)
- `/status`: `script-src 'self' 'unsafe-inline'` (status polling)
- All routes: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`

## History

- 2026-06-21: Full refactor from inline CSS/JS to extracted files. Wouter replaced with manual router. SEO overhaul (JSON-LD, OG, Twitter, canonical, sitemap, robots). Changelog page created. Subscription endpoint secured behind CF Function + proxy origin check.

## Related

- [[proxy-origin-check]] — The endpoint this site calls for subscriptions
- [[r2-release-pipeline]] — The binaries documented in the changelog
- [[ghost-preview-system]] — The TUI features documented on the site
