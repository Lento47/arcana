# Dashboard Architecture — Arcana Web SaaS

**Date:** 2026-07-11  
**Contract:** arcana-web-dashboard v0.3.0 ($1,000 fixed-price)  
**Status:** Draft / Pre-implementation

---

## 1. Directory / File Tree

### arcana-site (new + modified files)

```
public/
├── workspace/
│   ├── index.html              [MODIFY] — Enhanced dashboard with sparklines, model breakdown, recent sessions list
│   ├── sessions/
│   │   └── index.html          [CREATE] — Session browser page
│   ├── proxy/
│   │   └── index.html          [CREATE] — Proxy config read-only display
│   ├── billing/
│   │   └── index.html          [CREATE] — Transaction history + subscription status
│   └── settings/
│       └── index.html          [CREATE] — Profile, theme, notification prefs
├── css/
│   ├── workspace.css           [MODIFY] — Add page-specific component classes
│   └── workspace-pages.css     [CREATE] — Shared page layout styles (tables, forms, search)
├── js/
│   ├── workspace.js            [MODIFY] — Extract dashboard-specific init; add shared auth helper
│   ├── workspace-dashboard.js  [CREATE] — Dashboard page logic (sparklines, model breakdown)
│   ├── workspace-sessions.js   [CREATE] — Sessions page logic (search, expand, filter)
│   ├── workspace-billing.js    [CREATE] — Billing page logic (transactions, sub status)
│   ├── workspace-settings.js   [CREATE] — Settings page logic (profile form, theme toggle)
│   └── workspace-proxy.js      [CREATE] — Proxy config logic (balance, caps, providers)
└── _headers                    [MODIFY] — Add CSP rules for new workspace sub-pages (connect-src etc.)
```

```
functions/
├── api/
│   ├── create-sub.ts           [UNCHANGED]
│   ├── status.ts               [UNCHANGED]
│   ├── sessions.ts             [CREATE] — Thin auth proxy → /v1/sessions
│   ├── billing.ts              [CREATE] — Thin auth proxy → /v1/purchases
│   └── profile.ts              [CREATE] — Thin auth proxy → /v1/profile (GET + PUT)
├── _middleware.js              [UNCHANGED]
├── credits.tsx                 [UNCHANGED]
└── credits/                    [UNCHANGED]
```

### arcana-proxy (modified)

```
src/
└── index.ts                    [MODIFY] — Add 5 new endpoints + session recording hooks
```

### Zero new files in:
- `arcana-license-server/` — No changes
- `public/js/supabase.js` — No changes
- `public/js/auth.js` — No changes
- `functions/credits.tsx` — No changes

---

## 2. Navigation / Routing Strategy

**Decision: Full page loads, separate HTML files, shared sidebar shell repeated per page.**

### Rationale
1. Matches existing static-site pattern (no framework, no build step)
2. Real URLs → proper browser back/forward, link sharing, bookmarking
3. No SPA complexity (hash routing, pushState management)
4. Sidebar shell is ~44 lines of HTML — trivial duplication
5. Cloudflare Pages serves `public/workspace/sessions/index.html` at `/workspace/sessions` automatically

### Sidebar nav transformation

Each HTML page contains the same sidebar HTML, but with one key difference: the active nav item gets the `active` class, and disabled items that are now enabled become `<a>` links instead of `<span class="disabled">`.

**Dashboard** (`/workspace` → `workspace/index.html`):
```html
<a class="nav-item active" href="/workspace">Dashboard</a>
<div class="side-sep"></div>
<div class="side-section">Workspace</div>
<a class="nav-item" href="/workspace/sessions">Sessions</a>
<!-- Memory stays disabled -->
<span class="nav-item disabled">Memory</span>
<div class="side-sep"></div>
<div class="side-section">Configuration</div>
<!-- API Keys stays disabled -->
<span class="nav-item disabled">API Keys</span>
<a class="nav-item" href="/workspace/proxy">Proxy</a>
<div class="side-sep"></div>
<div class="side-section">Account</div>
<a class="nav-item" href="/workspace/billing">Billing</a>
<a class="nav-item" href="/workspace/settings">Settings</a>
```

**Sessions** (`/workspace/sessions/`):
```html
<!-- Same sidebar, but Sessions gets .active, Dashboard loses it -->
<a class="nav-item" href="/workspace">Dashboard</a>
...
<a class="nav-item active" href="/workspace/sessions">Sessions</a>
```

### JS loading chain

Each page loads scripts in this order:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="/js/supabase.js"></script>
<script src="/js/workspace.js"></script>
<script src="/js/workspace-sessions.js"></script>   <!-- page-specific -->
```

- `supabase.js` — Initializes Supabase client, fires `arcana:session` / `arcana:signed-out` events
- `workspace.js` — Handles auth guard, sidebar user display, signout, mobile menu; exposes `window.__ARCANA_WORKSPACE__`  
- `workspace-{page}.js` — Page-specific logic; receives auth session via custom event

---

## 3. Shared Utilities

### `workspace.js` — shared module (refactored)

```js
// Exposed on window.__ARCANA_WORKSPACE__
window.__ARCANA_WORKSPACE__ = {
  pf: proxyFetch,        // async proxy fetch with auto-refresh on 401
  sb: supabaseClient,    // reference to Supabase client
  user: null,            // current user object { id, email }
  session: null,         // current Supabase session
  initShared: fn,        // init sidebar + auth guard
}
```

### `pf(url, token)` — proxy fetch helper (unchanged from current)

```js
async function pf(path, token) {
  var r = await fetch(P + path, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) {
    var ref = await sb.auth.refreshSession();
    if (ref.data.session) {
      r = await fetch(P + path, { headers: { Authorization: 'Bearer ' + ref.data.session.access_token } });
      if (r.ok) return r.json();
    }
    await sb.auth.signOut();
    location.replace('/auth');
    return null;
  }
  if (!r.ok) throw Error('Proxy ' + r.status);
  return r.json();
}
```

### `proxyFetch(path, options)` — enhanced version for PUT etc.

```js
async function proxyFetch(path, options) {
  // Takes method, body for PUT/POST support
  // Auto-adds Authorization header
  // Auto-refresh on 401
}
```

### Page lifecycle

1. `supabase.js` fires `arcana:session` event with session data
2. `workspace.js` receives event → populates sidebar user → fires `arcana:workspace-ready`
3. Page script listens for `arcana:workspace-ready` → starts page init

---

## 4. Data Flow

```
[Proxy KV] → [arcana-proxy endpoint] → [Pages Function (optional)] → [Browser JS] → [DOM]
```

### Data flow patterns

**Pattern A — Direct browser→proxy (read-heavy, simple):**
```
workspace-sessions.js → pf('/v1/sessions?limit=20', token) → arcana-proxy → KV → JSON → DOM
```
Used for: sessions list, purchases, profile GET, proxy config (balance/caps)

**Pattern B — Pages Function relay (write operations, CSP-controlled):**
```
workspace-settings.js → fetch('/api/profile', {method:'PUT', body}) → functions/api/profile.ts → arcana-proxy /v1/profile → KV → JSON → DOM
```
Used for: profile updates (PUT), any operation needing server-side validation

**Pattern C — SSR page (complex pages):**
```
Cloudflare Pages Function → fetch from proxy → render HTML → send to browser
```
NOT used here — all pages are static HTML + client-side JS. This keeps the pattern consistent with existing workspace.

### Why both direct and relay?

The existing `_headers` CSP allows `connect-src` to the proxy directly. For reads, calling the proxy via `pf()` is simpler and already proven. Pages Functions add needless latency and complexity as intermediaries for GET requests.

Pages Functions ARE created per the contract (`functions/api/sessions.ts`, etc.) but they serve as:
1. A CSP-friendly alternative if CSP rules change
2. A place to add server-side logging without touching the proxy
3. PUT / POST relay for operations where the proxy requires Origin validation

---

## 5. KV Schema

### Existing KV keys (unchanged)

| Prefix | Shape | Used by |
|--------|-------|---------|
| `balance:${userId}` | `{ credits: number, updatedAt: number }` | Balance display |
| `usage:daily:${userId}:${date}` | string (count) | Usage tracking |
| `usage:${userId}:${date}` | JSON | Usage detail |
| `purchase:${orderId}` | `{ amount, creditUserId, credits, status }` | Purchase capture |
| `sub:${subId}` | `{ email, plan, status, expiresAt }` | Subscription mgmt |
| `license:${key}` | `{ id, tier }` | License auth |
| `email_account:${email}` | `{ licenseKey, subId, tier }` | Email→license lookup |
| `account:${userId}` | `{ username, tier }` | Account info |

### New KV keys

#### Sessions

| Key | Shape | Description |
|-----|-------|-------------|
| `session:${sessionId}` | `SessionDetail` | Full session record (written at completion) |
| `user_sessions:${userId}` | `SessionSummary[]` | Array of latest 50 session summaries |

**`SessionDetail` shape:**
```json
{
  "id": "a1b2c3d4-...",
  "userId": "supabase-user-id",
  "model": "openrouter:deepseek/deepseek-chat",
  "provider": "openrouter",
  "tokensIn": 450,
  "tokensOut": 1200,
  "costCredits": 0.85,
  "durationMs": 3400,
  "createdAt": "2026-07-11T14:30:00.000Z",
  "status": "completed",
  "messageCount": 4,
  "summary": "User asked about architecture design. Model responded with detailed plan.",
  "firstMessage": "Design a system for...",
  "lastMessage": "Here is the architecture..."
}
```

**`SessionSummary` shape (lighter, for list display):**
```json
{
  "id": "a1b2c3d4-...",
  "model": "deepseek/deepseek-chat",
  "provider": "openrouter",
  "tokensIn": 450,
  "tokensOut": 1200,
  "costCredits": 0.85,
  "durationMs": 3400,
  "createdAt": "2026-07-11T14:30:00.000Z",
  "status": "completed",
  "messageCount": 4
}
```

#### Purchases

| Key | Shape | Description |
|-----|-------|-------------|
| `user_purchases:${userId}` | `PurchaseRecord[]` | Array of purchase records for this user |

**`PurchaseRecord` shape:**
```json
{
  "orderId": "paypal-order-id",
  "amount": 10.00,
  "credits": 1000,
  "status": "completed",
  "createdAt": "2026-07-11T14:30:00.000Z",
  "paymentMethod": "paypal",
  "invoiceId": "INV-2026-..."
}
```

#### Profile

| Key | Shape | Description |
|-----|-------|-------------|
| `profile:${userId}` | `UserProfile` | User settings and preferences |

**`UserProfile` shape:**
```json
{
  "displayName": "Jane Doe",
  "email": "jane@example.com",
  "theme": "dark",
  "notifications": {
    "emailReceipts": true,
    "usageAlerts": false
  },
  "updatedAt": "2026-07-11T14:30:00.000Z"
}
```

### KV key limitations addressed

| Limitation | Mitigation |
|------------|------------|
| Value max 10MB | Session detail stores message summaries, not full content. Max 10KB per session. |
| No native lists/arrays | `user_sessions:${userId}` stores a JSON array. On write, load → push → shift if >50 → save. |
| Eventual consistency | Sessions list is eventually consistent. Acceptable for a dashboard. |
| No pagination beyond 50 | For MVP scope, 50 recent sessions is sufficient. Future: KV can't paginate without list operations. |

---

## 6. Session Data Model

### When sessions are recorded

Session recording hooks are added to the proxy at the end of `proxyOpenRouter` and `proxyWithFailover`, inside or after `adjustBalance`. Recording is fire-and-forget via `ctx.waitUntil()` — never blocks the response.

### Recording flow

```
Chat completion completes (stream or non-stream)
  → adjustBalance(token amounts, cost)
  → fire-and-forget: recordSession(user, model, tokens, cost, duration, status)
    → KV.put(`session:${sessionId}`, sessionDetail)
    → KV key manipulation on `user_sessions:${userId}` (update recent list)
```

### Recording hook signature

```typescript
async function recordSession(
  user: { id: string },
  model: string,
  provider: string,
  tokensIn: number,
  tokensOut: number,
  costCredits: number,
  durationMs: number,
  status: "completed" | "failed" | "streamed",
  messageCount: number,
  kv: KVNamespace
): Promise<void> {
  const sessionId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const summary = { id: sessionId, model, provider, tokensIn, tokensOut, costCredits, durationMs, createdAt, status, messageCount }
  const detail = { ...summary, userId: user.id, summary: "(generated)", firstMessage: "", lastMessage: "" }
  
  // Write individual session
  await kv.put(`session:${sessionId}`, JSON.stringify(detail), { expirationTtl: 86400 * 90 }) // 90-day retention
  
  // Update user's recent sessions list (keep last 50)
  const raw = await kv.get(`user_sessions:${user.id}`, "json") as any[] || []
  raw.unshift(summary)
  if (raw.length > 50) raw.length = 50
  await kv.put(`user_sessions:${user.id}`, JSON.stringify(raw), { expirationTtl: 86400 * 90 })
}
```

### Where to add hooks in proxy

In `proxyOpenRouter` (line ~625) — after `adjustBalance`:
```typescript
// After successful response processing, inside adjustBalance or right after it:
ctx.waitUntil(recordSession(user, body.model, "openrouter", tokensIn, tokensOut, actualCost * margin, Date.now() - startTime, "completed", body.messages?.length ?? 0, env.ARCANA_PROXY))
```

In `proxyWithFailover` (line ~826) — same pattern:
```typescript
ctx.waitUntil(recordSession(user, resolved.model, provider, tokensIn, tokensOut, actualCost * margin, Date.now() - startTime, "completed", body.messages?.length ?? 0, env.ARCANA_PROXY))
```

For streamed responses, recording happens after the stream completes (inside the stream consumer `finally` block).

---

## 7. Component / Page Architecture

### 7.1 Dashboard (enhanced) — `/workspace`

**File:** `public/workspace/index.html` + `public/js/workspace-dashboard.js`

**Current state:** Stats grid (3 cards) + "Recent Sessions" empty state card

**Enhancements:**
1. **Cost sparkline** — Inline SVG sparkline (small, no library). 7-day credit usage trend. Data from new proxy endpoint or computed from existing usage data.
2. **Model usage breakdown** — Simple stacked horizontal bar showing % of requests per model (top 5). Data from recent sessions.
3. **Recent sessions list** — Replace empty state with last 5 sessions showing model, tokens, cost, time. Clickable → links to `/workspace/sessions`.

**CSS additions** (in `workspace.css` or `workspace-pages.css`):
- `.sparkline` — SVG-based sparkline container
- `.model-bar` — Usage breakdown bar
- `.session-row` — Compact session list item

**Layout:**
```html
<!-- Existing stats grid (unchanged) -->
<div class="stats-grid" id="ws-stats">...</div>

<!-- New row: sparkline + model breakdown -->
<div class="dashboard-grid">
  <div class="card">
    <div class="card-head"><h2>7-Day Cost</h2></div>
    <div class="card-body">
      <svg class="sparkline" id="ws-sparkline" viewBox="0 0 200 40"></svg>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Model Usage</h2></div>
    <div class="card-body" id="ws-model-usage"></div>
  </div>
</div>

<!-- Recent sessions (replaces empty state) -->
<div class="card">
  <div class="card-head"><h2>Recent Sessions</h2></div>
  <div class="card-body" id="ws-recent-sessions"></div>
</div>
```

**Data sources:**
- Balance, credits, usage: existing `/v1/balance`, `/v1/usage`
- Cost trend: `/v1/sessions?limit=100` (compute daily totals)
- Model breakdown: same session data
- Recent sessions: `/v1/sessions?limit=5`

### 7.2 Sessions — `/workspace/sessions`

**File:** `public/workspace/sessions/index.html` + `public/js/workspace-sessions.js`

**Page structure:**
```html
<h1>Sessions</h1>

<!-- Search + Filter bar -->
<div class="toolbar">
  <input type="text" id="s-search" placeholder="Search by model..." class="search-input">
  <select id="s-filter-model" class="filter-select">
    <option value="">All models</option>
  </select>
  <select id="s-filter-status" class="filter-select">
    <option value="">All statuses</option>
    <option value="completed">Completed</option>
    <option value="failed">Failed</option>
  </select>
</div>

<!-- Skeleton loader -->
<div class="skel-list" id="s-skeleton">
  <div class="skel-row">...</div>
  <div class="skel-row">...</div>
</div>

<!-- Session table -->
<div class="session-table" id="s-table" style="display:none">
  <!-- Rows rendered by JS -->
</div>

<!-- Empty state -->
<div class="empty-state" id="s-empty" style="display:none">...</div>

<!-- Pagination -->
<div class="pagination" id="s-pagination">
  <button id="s-prev">← Previous</button>
  <span id="s-page-info">Page 1</span>
  <button id="s-next">Next →</button>
</div>
```

**Session row (collapsed):**
```html
<div class="session-row" data-id="...">
  <div class="sr-model">deepseek/deepseek-chat</div>
  <div class="sr-tokens">1,650</div>
  <div class="sr-cost">$0.01</div>
  <div class="sr-time">2 min ago</div>
  <button class="sr-expand">+</button>
</div>
```

**Session row (expanded):**
```html
<div class="session-row expanded" data-id="...">
  <!-- Same collapsed header -->
  <div class="sr-detail">
    <div class="sr-detail-grid">
      <div><span class="label">Model</span> deepseek/deepseek-chat</div>
      <div><span class="label">Provider</span> openrouter</div>
      <div><span class="label">Tokens In</span> 450</div>
      <div><span class="label">Tokens Out</span> 1,200</div>
      <div><span class="label">Cost</span> 0.85 credits</div>
      <div><span class="label">Duration</span> 3.4s</div>
      <div><span class="label">Messages</span> 4</div>
      <div><span class="label">Status</span> completed</div>
    </div>
  </div>
</div>
```

**JS logic:**
- On load, fetch `/v1/sessions?limit=50`
- Render rows into `#s-table`
- Search input filters by model name (client-side, real-time)
- Dropdown filters by model/status (client-side)
- Expand/collapse via click on row, toggle `expanded` class
- Pagination: chunk the 50-session array into pages of 10

**CSS additions:**
- `.toolbar` — Flex row with search + filters
- `.search-input`, `.filter-select` — Styled inputs matching design system
- `.session-table` — Table-like layout with rows
- `.session-row` — Hover, clickable, expand animation
- `.sr-detail` — Expanded detail grid (2-column)
- `.pagination` — Simple prev/next + page number

### 7.3 Proxy Config — `/workspace/proxy`

**File:** `public/workspace/proxy/index.html` + `public/js/workspace-proxy.js`

**Page structure:**
```html
<h1>Proxy Configuration</h1>

<div class="proxy-grid">
  <div class="card">
    <div class="card-head"><h2>Credit Balance</h2></div>
    <div class="card-body">
      <div class="big-stat" id="p-balance">—</div>
      <div class="stat-sub">1 credit = 1¢ USD</div>
      <div class="bar-track"><div class="bar-fill" id="p-balance-bar"></div></div>
    </div>
  </div>
  
  <div class="card">
    <div class="card-head"><h2>Daily Usage Caps</h2></div>
    <div class="card-body" id="p-caps">
      <!-- Rendered by JS: tier name, used/limit, progress bar -->
    </div>
  </div>
  
  <div class="card">
    <div class="card-head"><h2>Provider Priority</h2></div>
    <div class="card-body" id="p-providers">
      <!-- Ordered list of providers, rendered by JS -->
    </div>
  </div>
  
  <div class="card">
    <div class="card-head"><h2>Tier Info</h2></div>
    <div class="card-body" id="p-tier">
      <!-- Current tier, renewal date, limits -->
    </div>
  </div>
</div>
```

**Data sources:**
- Balance: `/v1/balance`
- Daily usage: `/v1/usage`  
- Tier & caps: from `/v1/health` response (returns `user.id`, `tier`) + hardcoded DAILY_LIMITS lookup
- Provider priority: new proxy endpoint or from `/v1/health`
- All read-only — no edit functionality

**JS logic:**
- Fetch balance + usage + health in parallel
- Look up DAILY_LIMITS from hardcoded map (free=50, trial=200, pro=2000, team=5000)
- Render progress bars for each

### 7.4 Billing — `/workspace/billing`

**File:** `public/workspace/billing/index.html` + `public/js/workspace-billing.js`

**Page structure:**
```html
<h1>Billing</h1>

<!-- Subscription card -->
<div class="card" id="b-subscription">
  <div class="card-head"><h2>Subscription</h2></div>
  <div class="card-body">
    <div class="sub-grid">
      <div><span class="label">Plan</span> <span id="b-tier">—</span></div>
      <div><span class="label">Status</span> <span id="b-status">—</span></div>
      <div><span class="label">Renewal</span> <span id="b-renewal">—</span></div>
    </div>
  </div>
</div>

<!-- Transaction history -->
<div class="card">
  <div class="card-head"><h2>Transaction History</h2></div>
  <div class="card-body">
    <!-- Table or list -->
    <div class="tx-table" id="b-transactions">
      <!-- Rendered by JS -->
    </div>
    <div class="empty-state" id="b-empty" style="display:none">No purchases yet.</div>
  </div>
</div>
```

**Transaction row:**
```html
<div class="tx-row">
  <div class="tx-date">Jul 5, 2026</div>
  <div class="tx-amount">$10.00</div>
  <div class="tx-credits">+1,000</div>
  <div class="tx-method">PayPal</div>
  <div class="tx-status completed">Completed</div>
</div>
```

**Data sources:**
- Subscription status: `/api/billing?id=<subId>` (Pages Function → proxy `/v1/pay/sub-status`)
- Transaction history: `/v1/purchases` (new proxy endpoint)
- Note: subscription ID is stored in `email_account` for the user. JS needs to resolve it.

**JS logic:**
- Fetch `/v1/purchases` → render transaction rows
- Fetch sub status via email→subID resolution → render subscription card
- Show loading skeleton, then swap

### 7.5 Settings — `/workspace/settings`

**File:** `public/workspace/settings/index.html` + `public/js/workspace-settings.js`

**Page structure:**
```html
<h1>Settings</h1>

<!-- Profile card -->
<div class="card">
  <div class="card-head"><h2>Profile</h2></div>
  <div class="card-body">
    <div class="form-group">
      <label>Display Name</label>
      <input type="text" id="s-name" class="form-input" placeholder="Your name">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="s-email" class="form-input" disabled>
      <div class="hint">Email is managed by Supabase Auth</div>
    </div>
    <button class="btn-primary" id="s-save">Save Changes</button>
    <div class="msg" id="s-msg"></div>
  </div>
</div>

<!-- Preferences card -->
<div class="card">
  <div class="card-head"><h2>Preferences</h2></div>
  <div class="card-body">
    <div class="pref-row">
      <div>
        <div class="pref-label">Theme</div>
        <div class="pref-desc">Dark / Light mode</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="s-theme">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="pref-row">
      <div>
        <div class="pref-label">Email Receipts</div>
        <div class="pref-desc">Receive purchase receipts via email</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="s-receipts" checked>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="pref-row">
      <div>
        <div class="pref-label">Usage Alerts</div>
        <div class="pref-desc">Notify when approaching daily limit</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="s-alerts">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</div>
```

**Data sources:**
- Profile GET: `/v1/profile` (new proxy endpoint)  
- Profile PUT: `/api/profile` (Pages Function → proxy)
- Email: from Supabase session

**Theme toggle implementation:**
- Toggle checkbox adds/removes `data-theme="light"` on `<html>` element
- Stored in profile KV
- On load, read profile theme preference
- CSS uses `[data-theme="light"]` overrides for the light theme (reversed colors)

**JS logic:**
- Fetch `/v1/profile` → populate form fields
- Listen for theme toggle → immediately apply theme + save to profile
- "Save Changes" button → PUT to `/api/profile`
- Show success/error message

---

## 8. CSS Patterns

### New component classes in `workspace.css` and `workspace-pages.css`

```css
/* ===== Page Layout ===== */
.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem; }
@media(max-width:768px) { .dashboard-grid { grid-template-columns: 1fr; } }

/* ===== Toolbar (search + filters) ===== */
.toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); font-family: var(--font-sans); font-size: var(--text-sm); }
.filter-select { padding: 0.5rem 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); font-family: var(--font-sans); font-size: var(--text-sm); }

/* ===== Session Table ===== */
.session-table { display: flex; flex-direction: column; gap: 2px; }
.session-row { display: grid; grid-template-columns: 1fr 80px 60px 100px 30px; align-items: center; padding: 0.625rem 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; transition: background 0.12s; font-size: var(--text-sm); }
.session-row:hover { background: rgba(255,255,255,.04); }
.session-row.expanded { border-color: var(--color-primary); }
.sr-detail { grid-column: 1 / -1; padding: 0.75rem 0 0.25rem; border-top: 1px solid var(--color-divider); margin-top: 0.5rem; }
.sr-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }

/* ===== Big Stat (proxy page) ===== */
.big-stat { font-size: 2rem; font-weight: 400; color: var(--color-text); line-height: 1.2; }
.bar-track { height: 6px; background: var(--color-surface-2); border-radius: var(--radius-pill); margin-top: 0.5rem; overflow: hidden; }
.bar-fill { height: 100%; background: var(--color-primary); border-radius: var(--radius-pill); transition: width 0.3s; }

/* ===== Proxy Grid ===== */
.proxy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
@media(max-width:768px) { .proxy-grid { grid-template-columns: 1fr; } }

/* ===== Billing Cards ===== */
.sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.tx-table { display: flex; flex-direction: column; gap: 2px; }
.tx-row { display: grid; grid-template-columns: 1fr 80px 80px 80px 80px; align-items: center; padding: 0.625rem 0.75rem; font-size: var(--text-sm); }

/* ===== Settings Form ===== */
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 0.25rem; }
.form-input { width: 100%; padding: 0.5rem 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); font-family: var(--font-sans); font-size: var(--text-sm); outline: none; }
.form-input:focus { border-color: var(--color-primary); }
.form-input:disabled { opacity: 0.5; }
.pref-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--color-divider); }
.pref-row:last-child { border-bottom: none; }
.pref-label { font-size: var(--text-sm); color: var(--color-text); }
.pref-desc { font-size: var(--text-xs); color: var(--color-text-muted); }

/* ===== Toggle Switch ===== */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: var(--color-surface-2); border-radius: var(--radius-pill); border: 1px solid var(--color-border); transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 2px; bottom: 2px; background: var(--color-text-muted); border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .toggle-slider { background: var(--color-primary); border-color: var(--color-primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--color-bg); }

/* ===== Pagination ===== */
.pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 1rem 0; font-size: var(--text-sm); color: var(--color-text-muted); }
.pagination button { padding: 0.25rem 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer; font-family: inherit; }
.pagination button:hover { color: var(--color-text); border-color: var(--color-text-muted); }
.pagination button:disabled { opacity: 0.3; cursor: default; }

/* ===== Sparkline ===== */
.sparkline { width: 100%; height: 60px; }
.sparkline path { fill: none; stroke: var(--color-primary); stroke-width: 2; }
.sparkline .area { fill: rgba(179,140,255,.1); }

/* ===== Model Usage Bars ===== */
.usage-bar-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; font-size: var(--text-sm); }
.usage-bar-label { min-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.usage-bar-track { flex: 1; height: 8px; background: var(--color-surface-2); border-radius: var(--radius-pill); overflow: hidden; }
.usage-bar-fill { height: 100%; border-radius: var(--radius-pill); background: var(--color-primary); }
.usage-bar-pct { min-width: 36px; text-align: right; color: var(--color-text-muted); font-family: var(--font-mono); font-size: var(--text-xs); }
```

### Theme toggle CSS (in workspace.css)

```css
/* Light theme overrides */
[data-theme="light"] {
  --color-bg: #f5f5f5;
  --color-surface: #ffffff;
  --color-surface-2: #f0f0f0;
  --color-border: #e0e0e0;
  --color-divider: #e0e0e0;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
  --color-text-faint: #999999;
  --color-primary: #8B5CF6; /* slightly darker for light bg */
}
```

---

## 9. Proxy Endpoint Changes (arcana-proxy)

### 9.1 New endpoints to add to `src/index.ts`

All new endpoints go in the `switch` statement after auth check (~line 540), following existing patterns.

**Structural pattern:**
```typescript
// Inside the switch(url.pathname) block:
case "/v1/sessions":
  if (request.method === "GET") return handleGetSessions(request, user, env, corsHeaders)
  return json({ error: "method_not_allowed" }, 405, corsHeaders)
case "/v1/sessions/:id":
  // Handled via URL pattern matching
case "/v1/purchases":
  if (request.method === "GET") return handleGetPurchases(user, env, corsHeaders)
  return json({ error: "method_not_allowed" }, 405, corsHeaders)
case "/v1/profile":
  if (request.method === "GET") return handleGetProfile(user, env, corsHeaders)
  if (request.method === "PUT") return handlePutProfile(request, user, env, corsHeaders)
  return json({ error: "method_not_allowed" }, 405, corsHeaders)
```

For `/v1/sessions/:id`, we need URL path matching. Since the proxy uses exact `switch(url.pathname)`:
```typescript
// Before the switch, or as a regex check:
const sessionMatch = url.pathname.match(/^\/v1\/sessions\/([a-f0-9-]+)$/)
if (sessionMatch && request.method === "GET") {
  return handleGetSessionDetail(sessionMatch[1], user, env, corsHeaders)
}
// Place this BEFORE the /v1/sessions exact match
```

### 9.2 Handler implementations

**handleGetSessions:**
```typescript
async function handleGetSessions(user, env, cors) {
  const url = new URL(request.url) // need request object
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 50)
  // Read from KV
  const raw = await env.ARCANA_PROXY.get(`user_sessions:${user.id}`, "json") as any[] || []
  const sessions = raw.slice(0, limit)
  return json({ sessions, total: raw.length }, 200, cors)
}
```

**handleGetSessionDetail:**
```typescript
async function handleGetSessionDetail(sessionId, user, env, cors) {
  const session = await env.ARCANA_PROXY.get(`session:${sessionId}`, "json") as any
  if (!session) return json({ error: "not_found" }, 404, cors)
  if (session.userId !== user.id) return json({ error: "forbidden" }, 403, cors)
  return json(session, 200, cors)
}
```

**handleGetPurchases:**
```typescript
async function handleGetPurchases(user, env, cors) {
  const raw = await env.ARCANA_PROXY.get(`user_purchases:${user.id}`, "json") as any[] || []
  return json({ purchases: raw }, 200, cors)
}
```

**handleGetProfile / handlePutProfile:**
```typescript
async function handleGetProfile(user, env, cors) {
  const profile = await env.ARCANA_PROXY.get(`profile:${user.id}`, "json") as any
  return json(profile ?? { displayName: "", theme: "dark", notifications: { emailReceipts: true, usageAlerts: false } }, 200, cors)
}

async function handlePutProfile(request, user, env, cors) {
  const body = await request.json() as any
  // Validate: only allow known fields
  const allowed = ["displayName", "theme", "notifications"]
  const clean = {}
  for (const key of allowed) {
    if (body[key] !== undefined) clean[key] = body[key]
  }
  clean.updatedAt = Date.now()
  await env.ARCANA_PROXY.put(`profile:${user.id}`, JSON.stringify(clean))
  return json({ ok: true, profile: clean }, 200, cors)
}
```

### 9.3 Purchase recording hook

When a purchase is captured (in `handleCaptureReturn` and `handleCaptureOrder`), after crediting balance, fire-and-forget update `user_purchases:${userId}`:

```typescript
// After balance update in handleCaptureReturn (~line 1023):
ctx.waitUntil(recordPurchase(purchase.creditUserId, orderId, amount, credits, env.ARCANA_PROXY))

async function recordPurchase(userId, orderId, amount, credits, kv) {
  const raw = await kv.get(`user_purchases:${userId}`, "json") as any[] || []
  raw.unshift({ orderId, amount, credits, status: "completed", createdAt: new Date().toISOString(), paymentMethod: "paypal" })
  if (raw.length > 100) raw.length = 100
  await kv.put(`user_purchases:${userId}`, JSON.stringify(raw), { expirationTtl: 86400 * 365 })
}
```

### 9.4 Authorization considerations

All new endpoints go AFTER the existing `getUser()` auth check (~line 515). They inherit:
- IP rate limiting (50 req/min)
- User rate limiting (25 req/min)  
- Daily usage limit check (per tier)
- JWT/license key auth

No additional auth needed. All handlers receive the resolved `user` object.

---

## 10. Pages Functions (arcana-site)

### `functions/api/sessions.ts`
```typescript
const PROXY = "https://proxy.arcana.otnelhq.com"

export async function onRequest({ request, env }): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 })

  const url = new URL(request.url)
  const target = `${PROXY}/v1/sessions${url.search}`

  const upstream = await fetch(target, {
    headers: { "Authorization": request.headers.get("Authorization") || "" },
    signal: AbortSignal.timeout(10000),
  })

  const data = await upstream.text()
  return new Response(data, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Access-Control-Allow-Origin": "https://arcana.otnelhq.com",
      ...securityHeaders,
    },
  })
}
```

### `functions/api/billing.ts`
Same pattern, but targets `/v1/purchases` and also supports `/v1/pay/sub-status` for subscription data.

### `functions/api/profile.ts`
Supports both GET and PUT. PUT passes the request body through.

---

## 11. _headers CSP Updates

Add entries for new workspace sub-pages:

```
/workspace/sessions
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' https://proxy.arcana.otnelhq.com; frame-ancestors 'none'

/workspace/billing
  Content-Security-Policy: same as above

/workspace/proxy
  Content-Security-Policy: same as above

/workspace/settings
  Content-Security-Policy: same as above
```

Actually, the root `/*` rule already covers all paths. Only add entries if specific paths need different CSP. The existing root CSP already allows `connect-src` to the proxy and CDN. These sub-pages use the same permissions. **No CSP changes needed** unless a new external connection is introduced.

---

## 12. Skeleton Loader Pattern

Each page follows the same skeleton → content pattern as the existing dashboard:

```js
var skeleton = document.getElementById('skel')
var content = document.getElementById('content')

function showContent(visible) {
  if (skeleton) skeleton.style.display = visible ? 'none' : ''
  if (content) content.style.display = visible ? '' : 'none'
}

// On page load:
showContent(false)
loadData().then(data => {
  render(data)
  showContent(true)
}).catch(() => {
  showContent(true) // Show content with error state
})
```

Skeleton HTML:
```html
<div class="skel-list" id="skel">
  <div class="skel-row"><div class="skel-line w70"></div><div class="skel-line w30"></div></div>
  <div class="skel-row"><div class="skel-line w50"></div><div class="skel-line w40"></div></div>
  <div class="skel-row"><div class="skel-line w60"></div><div class="skel-line w20"></div></div>
</div>
```

---

## 13. Implementation Order

Based on dependency graph and risk:

| Order | Item | Dependencies | Risk | Est. time |
|-------|------|-------------|------|-----------|
| 1 | Proxy: Add session recording hooks | None (adds to existing flows) | Low | 0.5h |
| 2 | Proxy: Add `/v1/sessions` + `/v1/sessions/:id` | #1 | Low | 0.5h |
| 3 | Proxy: Add `/v1/purchases` + purchase recording | None (reads existing KV) | Low | 0.5h |
| 4 | Proxy: Add `/v1/profile` GET/PUT | None | Low | 0.5h |
| 5 | Pages Functions: sessions.ts, billing.ts, profile.ts | #2, #3, #4 | Low | 0.5h |
| 6 | Refactor workspace.js → shared auth + page-specific init | None | Medium | 1h |
| 7 | Dashboard enhancement (sparklines, model breakdown, recent) | #2 | Medium | 2h |
| 8 | Sessions page | #2, #6 | Medium | 2.5h |
| 9 | Settings page | #4, #6 | Medium | 1.5h |
| 10 | Billing page | #3, #6 | Low | 1.5h |
| 11 | Proxy Config page | #6 | Low | 1h |
| 12 | CSP, _headers, polish | All | Low | 0.5h |
| 13 | Verification (typecheck, dry-run, manual review) | All | — | 1h |

**Total estimated: ~13h dev time** (within $1,000 budget at reasonable rate)

---

## 14. Integration Points (arcana-proxy `index.ts`)

### Where to add new code

| Location | Line (approx.) | Action |
|----------|---------------|--------|
| `switch(url.pathname)` block | ~540 | Add cases for `/v1/sessions`, `/v1/purchases`, `/v1/profile` |
| `proxyOpenRouter` adjustBalance | ~625 | Add `ctx.waitUntil(recordSession(...))` call |
| `proxyWithFailover` adjustBalance | ~826 | Add `ctx.waitUntil(recordSession(...))` call |
| `handleCaptureReturn` balance update | ~1023 | Add `ctx.waitUntil(recordPurchase(...))` call |
| `handleCaptureOrder` balance update | ~1069 | Add `ctx.waitUntil(recordPurchase(...))` call |
| Before the switch statement | ~515-539 | Add regex match for `/v1/sessions/:id` |

### Code change patterns

**Adding session recording to existing handlers** — minimum diff:
```typescript
// In proxyOpenRouter, after adjustBalance (line ~665-666):
await adjustBalance(tokensIn, tokensOut, openRouterCost)
// NEW:
ctx.waitUntil(recordSession(user, body.model, "openrouter", tokensIn, tokensOut, 
  (openRouterCost ?? estimateCost(body.model, tokensIn, tokensOut)) * 1.4 * 100, 
  Date.now() - startTime, "completed", body.messages?.length ?? 0, env.ARCANA_PROXY))
```

Note: costCredits is in credits (1 credit = 1¢ = $0.01), so multiply the dollar cost by 100.

---

## 15. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| KV session list grows unbounded | Medium | Low | Cap at 50 items per user. 90-day TTL. |
| Session recording blocks response | Low | High | `ctx.waitUntil()` — always fire-and-forget, never await. |
| Session detail KV value exceeds 10MB | Low | Medium | Store only summaries (first/last message, not full history). Max 10KB per session. |
| CSP blocks new page JS/CSS | Low | Medium | All new assets served from same origin (`/js/`, `/css/`). Already covered by root CSP. |
| Auth token expires mid-session | Low | Medium | `pf()` auto-refreshes on 401. Page scripts check session validity. |
| PUT /v1/profile overwrites fields | Medium | Low | Server reads → merges → writes. Or client sends full profile object. |
| Theme toggle loses state on page navigation | Medium | Low | Theme stored in profile KV. On each page load, fetch profile → apply theme. |
| Light theme incomplete CSS coverage | Low | Medium | All new component CSS uses CSS custom properties. Light theme swaps var values. |
| Memory page excluded per scope | N/A | N/A | Left as disabled. Not in scope. |
| API Keys page excluded per scope | N/A | N/A | Left as disabled. arcana CLI uses license keys. |
| No production deploy | N/A | N/A | `npx wrangler pages deploy public --dry-run` for verification only. |

### What NOT to break (no-go zones)

1. **Payment flow** — Do not touch `handleCreateOrder`, `handleCaptureOrder`, `handleCaptureReturn`, `handlePayPalWebhook`, `handleCreateSub`, or `handleSubStatus`.
2. **Auth chain** — Do not modify `getUser()`, `verifySupabaseJWT()`, license validation, or trial logic.
3. **Rate limiting** — Do not modify `checkRateLimit()`, `checkDailyLimit()`, IP or user rate limit maps.
4. **Provider proxy** — Do not modify `proxyOpenRouter()`, `proxyWithFailover()`, key pool management, or provider priority resolution.
5. **`functions/credits.tsx`** — Do not touch the credit purchasing page.
6. **`public/js/supabase.js`** — Do not touch the Supabase SDK initialization.
7. **`public/js/auth.js`** — Do not touch the auth page script.

---

## 16. Verification Commands

```bash
# Type check proxy
cd L:/PROJECTS/arcana-proxy && npx tsc --noEmit

# Dry-run deploy (no production deploy)
cd L:/PROJECTS/arcana-site && npx wrangler pages deploy public --dry-run

# Manual review checklist:
# - /workspace — shows balance/credits/usage cards + sparkline + model breakdown + recent sessions
# - /workspace/sessions — lists sessions, search filters work, expand shows detail
# - /workspace/billing — shows transaction history + subscription status
# - /workspace/settings — loads profile, theme toggle works, save persists
# - /workspace/proxy — shows balance, daily caps, provider priority
# - Sidebar: disabled items still disabled, enabled items link correctly
# - Auth: sign out works from any page
# - Mobile: sidebar toggle works on all pages
```

---

## 17. Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser["Browser (arcana.otnelhq.com)"]
        WS[workspace.js<br/>Auth Guard + Sidebar]
        DASH[workspace-dashboard.js]
        SESS[workspace-sessions.js]
        BILL[workspace-billing.js]
        SETT[workspace-settings.js]
        PROX[workspace-proxy.js]
    end

    subgraph Supabase["Supabase Auth"]
        SB[Supabase JS SDK<br/>JWT Auth]
    end

    subgraph Pages["Cloudflare Pages"]
        STATIC[Static HTML/CSS<br/>public/workspace/*]
        PF[Pages Functions<br/>functions/api/*]
    end

    subgraph Proxy["arcana-proxy Worker"]
        AUTH[getUser()<br/>JWT Verification]
        EXISTING[/v1/balance<br/>/v1/usage<br/>/v1/health/]
        NEW[/v1/sessions<br/>/v1/purchases<br/>/v1/profile]
        RECORD[recordSession()<br/>recordPurchase()]
        CHAT[proxyOpenRouter<br/>proxyWithFailover]
    end

    subgraph KV["KV Namespace (ARCANA_PROXY)"]
        BAL[balance:*]
        USG[usage:*]
        SESS[session:*<br/>user_sessions:*]
        PUR[purchase:*<br/>user_purchases:*]
        PROF[profile:*]
        SUB[sub:*<br/>plan:*]
    end

    %% Data flows
    WS --> SB
    SB -->|JWT Token| WS
    
    DASH -->|pf()| EXISTING
    DASH -->|pf()| NEW
    SESS -->|pf()| NEW
    BILL -->|pf()| NEW
    SETT -->|pf() / api/profile| PROF
    
    EXISTING --> AUTH
    NEW --> AUTH
    
    EXISTING --> BAL
    EXISTING --> USG
    NEW --> SESS
    NEW --> PUR
    NEW --> PROF
    NEW --> SUB
    
    CHAT --> RECORD
    RECORD --> SESS
    
    EXISTING -->|response| WS
    NEW -->|response| SESS
    
    %% Pages Function flow
    SETT -.->|PUT /api/profile| PF
    PF -.->|forward| NEW
    
    style AUTH fill:#4a4,color:#fff
    style NEW fill:#66f,color:#fff
    style RECORD fill:#fa4,color:#fff
    style WS fill:#833,color:#fff
```

---

*End of architecture document. Ready for implementation phase.*
