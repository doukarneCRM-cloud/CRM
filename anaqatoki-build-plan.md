# Anaqatoki CRM — Ultra Build Plan
> Step-by-Step Construction Roadmap | Version 1.0 | 2026-04-13  
> References: `anaqatoki-crm-spec.md` · `anaqatoki-system-design.md`

---

## How to Use This File

- Work **strictly in phase order** — each phase has a gate check before moving on
- Every task has a checkbox `[ ]` — mark `[x]` when done and tested
- **Never skip the phase gate** — it catches sync issues before they compound
- Tasks marked `🔗` share a dependency with another phase — read the note
- Tasks marked `🎨` have specific design requirements from the reference screenshots
- Tasks marked `⚡` are real-time critical — test socket behavior after each

---

## Design Reference Summary
> Extracted from the 5 reference screenshots — all components must match this quality level

### Visual Patterns to Apply Everywhere

| Pattern | Reference | How to Apply |
|---------|-----------|-------------|
| **KPI Card** | FlowNest, Nexo, Dashboard #3 | Big bold number (700 32px) · small label above · colored pill badge (+4.2% ↑ or -3% ↓ in green/red) · optional mini sparkline bottom-right · white glass card · 20px radius · soft shadow |
| **Trend Badge** | All references | Pill shape · green bg for positive · red/pink for negative · arrow icon + % value · Poppins 600 12px |
| **Tab Navigation** | LoopAI, FlowNest | Pill-shaped tabs · active = filled brown/dark bg + white text · inactive = transparent + gray text · gap-2 between tabs · smooth transition |
| **Area Chart** | FlowNest, Nexo | Smooth curves (tension 0.4) · gradient fill from color → transparent · 2px stroke · hover tooltip with glass card style |
| **Agent Progress** | FlowNest Top Performers | Circular arc progress ring per agent · color varies per agent · number + label inside |
| **Table Rows** | All references | Avatar 32px circle · name bold + subtitle small gray · colored status pill · subtle hover bg · row separator is 1px light gray |
| **Sidebar** | Dashboard #3, Nexo | Icon + label nav items · active = brown pill bg · collapsed mode (icon only) · logo at top · divider before secondary section |
| **Dot Matrix Chart** | LoopAI Revenue | Grid of colored circles, height = value · very unique, use for Order Trend |
| **Donut Chart** | FlowNest Pipeline | Thick donut · center label shows total · each segment labeled · legend below |

---

## Phase Map Overview

```
Phase 0 │ Project Setup & Design System         (Days 1–3)
Phase 1 │ Auth, Layout & Navigation             (Days 4–6)
Phase 2 │ Backend Foundation                    (Days 7–11)
Phase 3 │ Orders Core — Backend                 (Days 12–16)
Phase 4 │ Orders Core — Frontend (Table + UI)   (Days 17–22)
Phase 5 │ Call Center Page                      (Days 23–27)
Phase 6 │ Dashboard (Live KPIs + Charts)        (Days 28–33)
Phase 7 │ Products & Stock                      (Days 34–37)
Phase 8 │ Clients Page                          (Days 38–40)
Phase 9 │ Team, Roles & Assignment Engine       (Days 41–45)
Phase 10│ Youcan Integration                    (Days 46–50)
Phase 11│ Coliix Integration                    (Days 51–56)
Phase 12│ Analytics Page                        (Days 57–61)
Phase 13│ Settings + Notifications + Sound      (Days 62–65)
Phase 14│ Atelie Module                         (Days 66–69)
Phase 15│ Polish, Performance & Deploy          (Days 70–75)
```

---

## Phase 0 — Project Setup & Design System
> Goal: Every future component has a base to build from. No page is coded without this.

### 0.1 — Repository & Tooling

- [ ] Create monorepo: `/apps/frontend` (Vite + React) and `/apps/backend` (Fastify)
- [ ] Init Git with `.gitignore` for node_modules, .env files, dist folders
- [ ] Create root `package.json` with workspaces
- [ ] Install frontend base: `react@18`, `react-dom`, `vite`, `typescript`
- [ ] Install backend base: `fastify`, `typescript`, `ts-node`, `nodemon`
- [ ] Set up `tsconfig.json` for both apps (strict mode on)
- [ ] Configure ESLint + Prettier with shared config at root
- [ ] Create `.env.example` with all keys from system design Section 15.3
- [ ] Add `README.md` with setup instructions (npm install, env setup, dev start)

### 0.2 — Frontend Design System Tokens

- [ ] Install Tailwind CSS + configure `tailwind.config.ts`
- [ ] Add Poppins font via Google Fonts import in `index.html` (weights 300,400,500,600,700)
- [ ] Create `src/styles/tokens.css` with CSS variables:
  ```css
  --color-primary: #6B4226;
  --color-primary-light: #9C6B4E;
  --color-primary-dark: #3E2210;
  --color-accent: #F5EFE6;
  --color-bg: #FAFAF8;
  --color-surface: rgba(255,255,255,0.72);
  --radius-card: 20px;
  --radius-btn: 12px;
  --radius-input: 10px;
  --shadow-card: 0 4px 24px rgba(107,66,38,0.10);
  --shadow-hover: 0 8px 32px rgba(107,66,38,0.16);
  ```
- [ ] 🎨 Create `src/styles/glass.css` — glassmorphism base class used by all cards
- [ ] Extend Tailwind config with design tokens (brown palette, custom shadows, fonts)
- [ ] Create `src/constants/statusColors.ts` — canonical map of every status → color (Section 2.3 of spec)
- [ ] Create `src/constants/permissions.ts` — all RBAC permission strings
- [ ] Create `src/constants/routes.ts` — all route path constants

### 0.3 — Shared UI Component Library

Build these in isolation (no page logic — pure visual):

- [ ] 🎨 `<GlassCard>` — white glass surface, brown border, 20px radius, soft shadow, hover lift
- [ ] 🎨 `<KPICard>` — accepts: title, value, unit, percentageChange, trend (up/down/flat), sparklineData?, icon, color · Shows big number + trend badge · mini sparkline optional
- [ ] 🎨 `<TrendBadge>` — pill badge, green/red/gray, arrow icon, % value (used inside KPICard and table cells)
- [ ] 🎨 `<StatusBadge>` — accepts type ("confirmation"|"shipping") + value + optional size · maps to statusColors.ts · pill shape, colored bg, white text
- [ ] 🎨 `<PillTab>` / `<PillTabGroup>` — horizontal scrollable tab row, active = filled, inactive = transparent, smooth 200ms transition
- [ ] 🎨 `<GlassModal>` — centered overlay, glass background, 24px radius, backdrop blur, animated entry (scale + fade), close button top-right, scroll lock on body
- [ ] 🎨 `<CRMButton>` — variants: primary (brown), secondary (outline), ghost (text), danger (red) · loading state with spinner · disabled state
- [ ] 🎨 `<CRMInput>` — styled input with label, error message slot, 10px radius, brown focus ring
- [ ] 🎨 `<CRMSelect>` — styled dropdown with search, single/multi mode
- [ ] 🎨 `<AvatarChip>` — 32px circle avatar + name + optional subtitle + optional online dot
- [ ] 🎨 `<CircleProgress>` — SVG arc progress ring, accepts: value(0-100), color, size, label (for agent performance cards, inspired by FlowNest)
- [ ] 🎨 `<AgentMiniCard>` — small card: avatar + name + KPI number + trend badge (for dashboard agent list)
- [ ] 🎨 `<OrderSourceIcon>` — icon only component: Youcan/WhatsApp/Instagram/Manual with tooltip
- [ ] 🎨 `<HistoryIcon>` — small clickable icon with tooltip "View history"
- [ ] Create Storybook-style test page at `/dev/components` to visually verify all components

### 0.4 — Shared Table Component

- [ ] Install TanStack Table v8
- [ ] Build `<CRMTable>` — accepts columns config + data + pagination config
- [ ] Add: sticky header, row hover state, row checkbox (single + select-all)
- [ ] Add: pagination controls (page size selector: 20/50/100/All, prev/next)
- [ ] Add: empty state slot (custom message + icon)
- [ ] Add: loading skeleton rows (shimmer effect, 5 rows)
- [ ] Add: bulk action bar (appears at bottom when rows selected, slide-up animation)
- [ ] Test `<CRMTable>` with mock data of 100 rows — verify render < 100ms

### 0.5 — Global Filter Store

- [ ] Install Zustand
- [ ] Create `src/store/filterStore.ts` with FilterState interface (Section 6.1 of spec)
- [ ] Create `useFilterSync` hook — reads from and writes to URL query params
- [ ] Build `<GlobalFilterBar>` component:
  - [ ] Filter chips: City, Agent, Product, Date Range
  - [ ] Each chip: dismissible X button, click to open dropdown, animated count badge
  - [ ] Active filters highlighted in brown
  - [ ] "Clear all" button appears only when filters active
  - [ ] Sticky positioning, smooth collapse animation
- [ ] Test: apply filters → URL updates → refresh page → filters restore from URL

### ✅ Phase 0 Gate
> All of the following must be true before Phase 1 begins:
- [ ] `/dev/components` page renders all 15+ components without error
- [ ] KPICard renders correctly with positive/negative/flat trends
- [ ] StatusBadge shows correct color for all 9 confirmation + 9 shipping statuses
- [ ] CRMTable renders 100 mock rows with pagination in < 100ms
- [ ] GlobalFilterBar syncs to URL params and restores on refresh
- [ ] Design tokens are consistent — no hardcoded hex colors anywhere in components

---

## Phase 1 — Auth, Layout & Navigation
> Goal: Login works, role-based layout renders, sidebar navigates correctly.

### 1.1 — Backend Auth Module

- [ ] Create `src/modules/auth/auth.schema.ts` — Zod schemas: LoginBody, RefreshBody
- [ ] Create `src/shared/prisma.ts` — Prisma client singleton
- [ ] Set up PostgreSQL connection (local dev via Docker Compose)
- [ ] Run initial Prisma migration with: User, Role, Permission tables only
- [ ] Create `POST /api/v1/auth/login` — bcrypt verify, issue JWT access + refresh token
- [ ] Create `POST /api/v1/auth/refresh` — rotate refresh token, issue new access token
- [ ] Create `POST /api/v1/auth/logout` — invalidate refresh token
- [ ] Create auth middleware: `verifyJWT` — attaches `req.user` to every protected request
- [ ] Seed DB with 1 admin user + Admin role with all permissions
- [ ] Add rate limiting: 5 failed logins per IP per 5 min → Redis lockout

### 1.2 — Frontend Auth

- [ ] Install React Router v6
- [ ] Create `src/store/authStore.ts` — stores user, accessToken, isAuthenticated
- [ ] Create `src/services/api.ts` — Axios instance with:
  - [ ] Base URL from env
  - [ ] Auto-attach Authorization header from authStore
  - [ ] Interceptor: on 401 → call refresh → retry original request
  - [ ] Interceptor: on refresh fail → logout + redirect to /login
- [ ] 🎨 Build Login Page (`/login`):
  - [ ] Warm cream-to-brown gradient background (full screen)
  - [ ] Centered glass card (400px wide, 20px radius)
  - [ ] CRM logo placeholder at top center
  - [ ] "Welcome back" H2 + "Sign in to Anaqatoki" subtitle
  - [ ] Email input with envelope icon
  - [ ] Password input with eye toggle icon
  - [ ] "Remember me" checkbox (styled, brown accent)
  - [ ] Primary CRMButton "Sign In" with loading spinner state
  - [ ] Error state: red shake animation + error message below button
  - [ ] Lockout state: countdown timer shown ("Try again in 4:32")
- [ ] Test: valid credentials → dashboard redirect. Wrong credentials → error shown. 5 attempts → lockout timer.

### 1.3 — App Layout Shell

- [ ] Create `src/app/AppLayout.tsx` — wraps all authenticated pages
- [ ] 🎨 Build Sidebar:
  - [ ] Fixed left, 240px wide (expanded) / 64px (collapsed)
  - [ ] Logo area at top (logo image or "A" monogram)
  - [ ] Toggle button (chevron) to collapse/expand with smooth 200ms animation
  - [ ] Navigation items with icon + label:
    ```
    📊 Dashboard      → /dashboard
    📦 Orders         → /orders
    📞 Call Center    → /call-center
    🛍️ Products       → /products/list
    👥 Clients        → /clients
    👤 Team           → /team/agents
    📈 Analytics      → /analytics
    🔗 Integrations   → /integrations/store
    ── divider ──
    🏭 Atelie         → /atelie/employees
    ── divider ──
    ⚙️ Settings        → /settings
    ```
  - [ ] Active nav item: brown filled pill, white icon+text
  - [ ] Hover: light brown/beige bg tint
  - [ ] Collapsed mode: icon only with tooltip on hover
  - [ ] Bottom section: user avatar + name + role label + logout button
- [ ] 🎨 Build TopBar:
  - [ ] Right side: online agents avatars row (admin only) — max 5 shown, +N if more
  - [ ] Notification bell with unread count badge
  - [ ] User avatar + name + role + dropdown (profile, logout)
  - [ ] Global search input (placeholder — not functional yet)
  - [ ] Page title (dynamic from current route)
- [ ] Build route guards: `<PermissionGuard requires="..." />` — redirect if missing permission
- [ ] Create all route files as empty placeholder pages (just title text)
- [ ] Test: login as admin → see full sidebar. Login as agent → sidebar shows only Call Center + Products. Logout works.

### ✅ Phase 1 Gate
- [ ] Login → token stored → redirect to dashboard
- [ ] Refresh token rotation works (simulate expired access token)
- [ ] Sidebar collapses/expands smoothly with no layout break
- [ ] Route guard redirects correctly for agent role (no dashboard access)
- [ ] TopBar shows user info correctly
- [ ] Logout clears tokens and redirects to /login

---

## Phase 2 — Backend Foundation
> Goal: Database fully migrated, all shared middleware live, Socket.IO connected.

### 2.1 — Full Database Migration

- [ ] Write Prisma schema for ALL models from system design Section 5.1 in one migration
- [ ] Models to include: User, Role, Permission, Customer, Product, ProductVariant, Order, OrderItem, OrderLog, Store, ImportLog, ShippingCity, AssignmentRule, AtelieEmployee, WeeklyAttendance, SalaryPayment, Setting, CommissionRule
- [ ] Run `prisma migrate dev --name init_full_schema`
- [ ] Verify all indexes created (system design Section 5.2)
- [ ] Seed script: Admin user, default roles (Admin/Supervisor/Agent/Shipping/Atelie), all permissions, 1 default AssignmentRule, sample settings

### 2.2 — Backend Shared Modules

- [ ] Create `src/shared/redis.ts` — Redis client singleton (Upstash or local)
- [ ] Create `src/shared/socket.ts` — Socket.IO server, attach to Fastify
- [ ] Create `src/shared/queue.ts` — Bull queue setup (youcanSync, coliixPush, callbackAlert queues)
- [ ] Create `src/middleware/auth.middleware.ts` — verifyJWT, attach user+role+permissions
- [ ] Create `src/middleware/rbac.middleware.ts` — `requirePermission(code)` factory function
- [ ] Create `src/middleware/rateLimit.middleware.ts` — per-route rate limits
- [ ] Create `src/utils/kpiCalculator.ts` — canonical KPI formulas (all 6 from spec Section 7)
- [ ] Create `src/utils/phoneNormalize.ts` — Moroccan phone → +212XXXXXXXXX + display format
- [ ] Create `src/utils/pagination.ts` — shared paginate helper (page, pageSize → skip/take + meta)
- [ ] Create `src/utils/filterBuilder.ts` — converts FilterState query params → Prisma where object (used by every KPI + order query)

### 2.3 — Socket.IO Real-Time Setup ⚡

- [ ] Implement Socket.IO auth handshake (JWT verification on connect)
- [ ] Implement room joining on connect (per system design Section 7.1)
- [ ] Implement heartbeat handler: `socket.on('heartbeat')` → update `lastHeartbeat` in DB
- [ ] Implement online/offline user tracking with 2-minute timeout cron
- [ ] Emit `user:online` to `admin` room on connect
- [ ] Emit `user:offline` to `admin` room on disconnect
- [ ] Create `GET /api/v1/users/online` — returns currently online user IDs
- [ ] Test Socket.IO: open 2 browser tabs → admin sees both as online. Close one → goes offline within 2 min.

### 2.4 — Core API Scaffolding

- [ ] Create `GET /api/health` — returns `{ status: "ok", timestamp }` (for uptime monitoring)
- [ ] Create Swagger/OpenAPI plugin for Fastify
- [ ] Add global error handler — catches Prisma errors, returns standard error format (system design Section 6.5)
- [ ] Add request logger (Fastify pino)

### ✅ Phase 2 Gate
- [ ] `prisma migrate status` shows all migrations applied
- [ ] `GET /api/health` returns 200
- [ ] Socket.IO connects from frontend (browser console shows "connected")
- [ ] Online user tracking: open tab → online. Close tab → offline in ≤ 2 min. Admin TopBar shows live count.
- [ ] KPICalculator unit tests pass (test with mock Prisma data, verify all 6 formulas)
- [ ] phoneNormalize handles: 0661234567, +212661234567, 00212661234567 → same normalized output

---

## Phase 3 — Orders Core — Backend
> Goal: Full order CRUD + status changes + logs fully working via API.

### 3.1 — Order CRUD API

- [ ] `GET /api/v1/orders` — paginated list, all filters (system design Section 6.3), returns 20 fields per order
- [ ] `POST /api/v1/orders` — create manual order (validate: customer phone, product variant exists, stock > 0)
- [ ] `GET /api/v1/orders/:id` — full order with items, customer, agent, logs
- [ ] `PATCH /api/v1/orders/:id` — update order (customer info, items, notes, discount) — auto-recalculate total
- [ ] `DELETE /api/v1/orders/:id` — soft archive (`isArchived = true`) — never hard delete
- [ ] `GET /api/v1/orders/:id/logs` — all logs for order, filterable by type

### 3.2 — Order Status Engine

- [ ] `PATCH /api/v1/orders/:id/status` — update `confirmationStatus`
  - [ ] Validate: allowed transitions only (pending → awaiting/confirmed/cancelled/unreachable/callback/fake/out_of_stock)
  - [ ] Write `OrderLog` entry: type=CONFIRMATION, action="Status changed to X", performedBy, meta={from, to}
  - [ ] If status = `out_of_stock` → verify stock is actually 0 (else reject)
  - [ ] If status = `callback` → require `callbackAt` datetime in body
  - [ ] If status = `cancelled` → require `cancellationReason` in body
  - [ ] Emit socket event `order:updated` to `orders:all` and `agent:{assignedAgentId}`
  - [ ] Emit `kpi:refresh` to `dashboard` room
- [ ] Validate `confirmed` status requires: customer city exists in ShippingCity list

### 3.3 — Order Assignment API

- [ ] `PATCH /api/v1/orders/:id/assign` — assign/reassign/unassign
  - [ ] Validate: agentId exists + is active + has confirmation permission
  - [ ] Write OrderLog: "Assigned to {agent}" or "Reassigned from X to Y" or "Unassigned"
  - [ ] Emit `order:assigned` to `agent:{newAgentId}` room
  - [ ] Emit `order:updated` to `orders:all`
- [ ] `POST /api/v1/orders/bulk` — bulk actions handler:
  - [ ] Bulk assign: accepts orderIds[] + agentId
  - [ ] Bulk unassign: accepts orderIds[]
  - [ ] Bulk archive: accepts orderIds[]
  - [ ] Each action writes individual OrderLog per order
  - [ ] Emits socket events for each affected order

### 3.4 — Stock Auto-Trigger

- [ ] Hook into every `OrderItem` create/update: after saving, check variant stock
- [ ] If variant stock = 0: find all PENDING orders with that variant → set confirmationStatus = `out_of_stock` → write log "Auto-marked out of stock — variant depleted"
- [ ] Emit `stock:updated` to `orders:all`
- [ ] Test: set variant stock to 0 → all pending orders with it become out_of_stock

### 3.5 — Customer API (🔗 used by Orders + Clients page)

- [ ] `GET /api/v1/customers` — list with filters (city, tag, search by name/phone)
- [ ] `POST /api/v1/customers` — create, normalize phone, check duplicate by phone
- [ ] `PATCH /api/v1/customers/:id` — update tag, info
- [ ] `GET /api/v1/customers/:id/history` — all orders for customer (sorted by date desc)
- [ ] Upsert logic: when order arrives with phone → find existing or create new customer

### ✅ Phase 3 Gate
- [ ] Create order via API → appears in list with correct reference (ORD-26-XXXXX format)
- [ ] Status change: pending → confirmed → write log → socket event emits
- [ ] Cancelled status without reason → 400 error
- [ ] Callback status without callbackAt → 400 error
- [ ] Assign order → `order:assigned` socket event fires, appears in agent room
- [ ] Set stock to 0 → related pending orders auto-become out_of_stock
- [ ] Bulk assign 10 orders → all 10 get individual log entries
- [ ] Customer lookup by phone finds duplicates correctly

---

## Phase 4 — Orders Core — Frontend (Table + UI)
> Goal: The /orders page is fully functional and looks exactly like the design references.

### 4.1 — Orders Page Layout

- [ ] Create `/orders` route and page file
- [ ] Mount `<GlobalFilterBar>` at top with extra filters: Confirmation Status (multi), Shipping Status (multi)
- [ ] 🎨 Build Summary Cards row (5 cards, symmetric grid):
  - [ ] **Pending card**: Total count (big) · Assigned sub-count + agent mini-avatars row · Unassigned sub-count in orange badge
  - [ ] **Confirmed card**: Total confirmed count · Agent mini-avatar row with count per agent
  - [ ] **Out for Delivery card**: Total count · breakdown list by shipping sub-status with numbers
  - [ ] **Delivered card**: Total count · per-agent delivery count list
  - [ ] **Revenue card**: MAD amount bold · vs previous period comparison
  - [ ] All 5 cards use `<GlassCard>` + `<TrendBadge>` · live update via `kpi:refresh` socket ⚡

### 4.2 — Orders Table

- [ ] Use `<CRMTable>` base, configure 12 columns:
  - [ ] **Ref/Date**: `ORD-26-00164` small mono font · `06/04 · 20:12` below in gray
  - [ ] **Agent**: `<AvatarChip>` with color-coded background per agent · "Unassigned" gray pill if null
  - [ ] **Customer**: full name bold · normalized phone (06XXXXXXXX display) · WhatsApp icon button opens `wa.me/` link · entire cell clickable → Customer History Popup
  - [ ] **City/Address**: city name bold · address small gray below, truncated 20 chars
  - [ ] **Product**: name bold · color+size chips · quantity badge
  - [ ] **Price**: MAD amount bold right-aligned
  - [ ] **Confirmation Status**: `<StatusBadge>` + `<HistoryIcon>` → open confirmation logs popup
  - [ ] **Shipping Status**: `<StatusBadge>` + `<HistoryIcon>` → open shipping logs popup
  - [ ] **Notes**: confirmation note line 1 (truncated) · shipping note line 2 (truncated) · hover → full text in `<GlassCard>` tooltip
  - [ ] **Source**: `<OrderSourceIcon>` only (icon with tooltip)
  - [ ] **Coliix**: gray "Send" button → call API → replace with ✅ icon (green) or ❌ icon with error tooltip
  - [ ] **Actions**: ✏️ edit icon · 🗑️ archive icon (confirm dialog) · 👤 assign icon

### 4.3 — Order Edit Popup

- [ ] Build `<OrderEditModal>` using `<GlassModal>`:
  - [ ] Section 1 — Customer: name, phone (with normalize preview), city (searchable select from ShippingCity list), address
  - [ ] Section 2 — Items: product select → variant select (color+size) → qty input → shows stock remaining in small text → unit price auto-fills
  - [ ] Add item button (+ row)
  - [ ] Section 3 — Pricing: subtotal auto-calc · discount type toggle (MAD | %) · discount amount · **total live-calculated** shown in large bold
  - [ ] Section 4 — Notes: confirmation note textarea · shipping instruction textarea
  - [ ] Save button with loading state · optimistic update on success
  - [ ] Shipping status fields: read-only with gray bg and lock icon

### 4.4 — Order Logs Popup

- [ ] Build `<OrderLogsModal>` using `<GlassModal>`:
  - [ ] Timeline view: each log = icon + action text + agent name + timestamp
  - [ ] Confirmation logs tab and Shipping logs tab
  - [ ] Empty state: "No history yet" with clock icon

### 4.5 — Customer History Popup

- [ ] Build `<CustomerHistoryModal>`:
  - [ ] Header: customer name + phone + tag pill (Normal/VIP/Blacklisted) with edit button
  - [ ] Stats row: total orders, delivered, cancelled, return rate
  - [ ] Orders list: mini table with ref, product, status badge, date
  - [ ] Tag change: admin/supervisor only — dropdown to change tag

### 4.6 — Bulk Action Bar

- [ ] Slide-up bar when ≥1 row checked:
  - [ ] "X orders selected" count
  - [ ] Assign button → `<AgentPickerModal>` (list of active agents, click to select)
  - [ ] Reassign button → same modal
  - [ ] Unassign button → confirm dialog
  - [ ] Send to Coliix button → progress indicator showing X/Y sent
  - [ ] Clear selection button

### ✅ Phase 4 Gate
- [ ] Orders table loads with pagination (20 per page, switch to 50)
- [ ] All 12 columns render correctly with real data
- [ ] Status badge shows correct color for each status
- [ ] Click customer → history popup opens with correct order list
- [ ] Edit order → change product + discount → total updates live
- [ ] Save edit → table row updates without full page reload (optimistic update)
- [ ] Click history icon → logs popup shows timeline
- [ ] Select 3 orders → bulk assign → all 3 get new agent → table reflects instantly ⚡
- [ ] Send to Coliix → shows ✅ or ❌ with reason
- [ ] Filter by agent → table shows only that agent's orders · summary cards also update ⚡

---

## Phase 5 — Call Center Page
> Goal: Agents can fully manage their order pipeline from this page.

### 5.1 — Agent KPI Cards

- [ ] 🎨 Build 4 KPI cards at top of Call Center page:
  - [ ] **Today's Orders**: count assigned today · filter by local date
  - [ ] **Confirmation Pipeline**: mini cards per status with count (pending/awaiting/confirmed/...) — only statuses with orders shown
  - [ ] **Shipping Pipeline**: same style, shipping statuses with counts
  - [ ] **Commission Card**: confirmed orders × onConfirm rate + delivered orders × onDeliver rate = **total MAD** · breakdown shown below total
  - [ ] Cards live-update via socket ⚡ (agent room events)

### 5.2 — Call Center Table

- [ ] Columns: Ref, Customer (name+phone), Product, Price, Confirmation Status, Action button
- [ ] 🎨 Two-section accordion layout:
  - [ ] **Confirmation** section header (clickable expand/collapse) + count badge
    - [ ] Sub-sections per confirmation status: pending(N), awaiting(N), confirmed(N), ... — only show statuses with orders
    - [ ] Each sub-section is a collapsible group with its orders
  - [ ] **Shipping** section header + count badge
    - [ ] Sub-sections per shipping status + history icon per row
    - [ ] History icon → `<OrderLogsModal>` (shipping type)
- [ ] 🎨 "Reported" orders rows: soft pink glow pulsing border animation when `callbackAt` has passed

### 5.3 — Order Action Popup (Full Call Center Version)

- [ ] Build `<CallCenterOrderModal>` (extends `<GlassModal>`):
  - [ ] **Section 1 — Customer Info**:
    - [ ] Full name (editable), phone (normalized + display), WhatsApp button
    - [ ] City (searchable select — validate against ShippingCity list, mark ✅ valid or ❌ invalid)
    - [ ] Address (editable)
    - [ ] City validation: if city not in list → show warning "⚠️ City not in Coliix list"
  - [ ] **Section 2 — Product Details**:
    - [ ] Product selector → Color selector → Size selector → Qty input
    - [ ] Stock indicator: "12 left" in green / "3 left" in yellow / "0" in red
    - [ ] Unit price auto-fills from variant
  - [ ] **Section 3 — Pricing**:
    - [ ] Unit price field (editable)
    - [ ] Discount toggle: MAD | % → amount field
    - [ ] Total: large bold live-calculated
  - [ ] **Section 4 — Notes**:
    - [ ] Confirmation note (textarea, required before confirming)
    - [ ] Shipping instruction (textarea, optional)
  - [ ] **Section 5 — Client History**:
    - [ ] Compact order list: last 5 orders with status badges
    - [ ] Client tag pill: Normal/VIP/Blacklisted
  - [ ] **Section 6 — Status Action Buttons** (matching the screenshot provided):
    ```
    Row 1: [ ✅ Confirm ]  [ ❌ Cancel ]  [ 📅 Report ]
    Row 2: [ 📵 Unreachable ]  [ 🚫 Fake ]  [ 📦 No Stock ]
    ```
    - [ ] Confirm → requires confirmation note to be filled → calls PATCH /status API
    - [ ] Cancel → opens inline reason field (required) → calls PATCH /status API
    - [ ] Report → opens inline date+time picker → calls PATCH /status API
    - [ ] Unreachable / Fake / No Stock → direct call with confirmation dialog
    - [ ] Buttons disabled + gray with lock icon if order is shipped (shippingStatus ≠ not_shipped)
  - [ ] **Save Changes button**: visible only if customer info or product was edited

### ✅ Phase 5 Gate
- [ ] Agent logs in → Call Center shows only their orders
- [ ] Confirmation pipeline card shows correct counts per status
- [ ] Commission card calculates correctly (test: confirm 3 orders × 10 MAD = 30 MAD)
- [ ] Click order row → modal opens with all 6 sections
- [ ] Confirm order with note → status changes → socket fires → card counts update ⚡
- [ ] Cancel without reason → button stays disabled
- [ ] Report order → callbackAt saved → row shows glow at callback time
- [ ] City not in Coliix list → warning shows
- [ ] Shipped order → all status buttons disabled + lock icon shown
- [ ] Stock = 0 → No Stock button available, others show stock warning

---

## Phase 6 — Dashboard (Live KPIs + Charts)
> Goal: Admin dashboard is fully live, filters sync across all KPI data.

### 6.1 — KPI Backend Endpoint

- [ ] `GET /api/v1/kpi/dashboard` — accepts all filter params → returns all 6 KPI values + comparison period values
- [ ] Uses `kpiCalculator.ts` exclusively — no inline queries in controller
- [ ] Caches result in Redis with filter hash key, 30s TTL
- [ ] Invalidated on: order status change, new order, shipping update
- [ ] Returns agent performance array: per agent — name, orders, confirmationRate, deliveryRate
- [ ] Returns topProducts array: product name, orders count, revenue
- [ ] Returns topCities array: city name, orders count, deliveryRate
- [ ] Returns orderTrendData: orders per day for date range
- [ ] Returns statusBreakdown: count per confirmationStatus + count per shippingStatus

### 6.2 — Dashboard Page Layout

- [ ] Mount `<GlobalFilterBar>` at top (City, Agent, Product, Date Range)
- [ ] 🎨 **KPI Cards Row** (6 cards, symmetric grid, responsive):
  - [ ] Orders Received · Confirmation Rate · Delivery Rate · Return Rate · Revenue · Profit
  - [ ] Each: `<KPICard>` with big number + `<TrendBadge>` + compare label ("vs last week")
  - [ ] Live update via `kpi:refresh` socket ⚡

### 6.3 — Dashboard Charts

- [ ] Install Recharts
- [ ] 🎨 **Order Trend Chart** — dot/bubble matrix style (inspired by LoopAI reference):
  - [ ] X-axis: dates, Y-axis: order count
  - [ ] Each day = vertical stack of colored dots (height proportional to volume)
  - [ ] Compact, small height (~120px)
  - [ ] Hover tooltip: date + count
- [ ] 🎨 **Orders by Status Chart** — thick donut/ring (inspired by FlowNest):
  - [ ] Each segment = confirmation status with color from statusColors.ts
  - [ ] Center label: total orders
  - [ ] Legend below with count per status
  - [ ] Hover: segment expands slightly
- [ ] 🎨 **Delivery Status Chart** — horizontal bar chart:
  - [ ] Each bar = shipping status, length = count
  - [ ] Color per status from statusColors.ts
  - [ ] Count label at end of each bar

### 6.4 — Dashboard Agent + Performer Cards

- [ ] 🎨 **Top Agents Section** (inspired by FlowNest Top Performers):
  - [ ] Per agent: `<AvatarChip>` + name + `<CircleProgress>` ring showing confirmationRate
  - [ ] Second ring showing deliveryRate
  - [ ] Small numbers: "34 confirmed · 28 delivered"
  - [ ] Sorted by confirmation rate descending
  - [ ] "This period" label based on active date filter
- [ ] 🎨 **Top Products** card:
  - [ ] Ranked list: #1 #2 #3 ...
  - [ ] Product name + order count + revenue in MAD
  - [ ] Small horizontal progress bar (relative to highest)
- [ ] 🎨 **Top Cities** card:
  - [ ] Same ranked list style: city name + order count + delivery rate %

### ✅ Phase 6 Gate
- [ ] Dashboard loads in < 2 seconds with real data
- [ ] All 6 KPI cards show correct values (cross-check with database counts)
- [ ] Confirmation Rate formula: confirmed / (total - pending - fake) × 100 — verified
- [ ] Apply agent filter → ALL cards and charts update for that agent only ⚡
- [ ] Apply date filter → ALL cards and charts update to that date range ⚡
- [ ] New order webhook fires (simulate) → Orders Received card increments within 500ms ⚡
- [ ] Dot matrix chart renders with correct dot heights
- [ ] Donut chart shows all 9 confirmation statuses with correct colors
- [ ] Agent performance cards show % rings correctly

---

## Phase 7 — Products & Stock
> Goal: Products can be created/edited, stock is tracked, and out-of-stock auto-trigger works end-to-end.

### 7.1 — Products Backend

- [ ] `GET /api/v1/products` — list with variants, stock counts, filter by isActive
- [ ] `POST /api/v1/products` — create product with variants, upload photo to Cloudinary
- [ ] `PATCH /api/v1/products/:id` — update product info + manage variants (add/edit/remove)
- [ ] `PATCH /api/v1/products/:id/variants/:vid/stock` — update stock quantity, emit `stock:updated`
- [ ] `POST /api/v1/products/upload-image` — multipart upload → Cloudinary → return URL
- [ ] Product soft-delete: `isActive = false` (never hard delete — orders reference products)

### 7.2 — Product List Page (`/products/list`)

- [ ] 🎨 Responsive card grid (4 cols desktop, 2 tablet, 1 mobile):
  - [ ] Product photo (16:9 ratio, object-cover) with fallback placeholder
  - [ ] Product name H3
  - [ ] Variant chips grid: `Black : L (12)` — color-coded bg by stock level (green/yellow/red)
  - [ ] Edit button → `<ProductEditModal>`
- [ ] **Add Product** button (top right, primary brown button)
- [ ] Choice modal: "Create in CRM" or "Import from Youcan" (Youcan option disabled with "Coming in Phase 10" tooltip until Phase 10)
- [ ] 🎨 **Create Product Modal**:
  - [ ] Photo upload area (drag-and-drop + click, shows preview after upload)
  - [ ] Product name input
  - [ ] Variants builder table: rows for each variant — color input, size input, price input, initial stock input, remove row button
  - [ ] Add row button
  - [ ] Save with optimistic preview in grid

### 7.3 — Stock Matrix Page (`/products/stock`)

- [ ] 🎨 Matrix table (inspired by spreadsheet + design system):
  - [ ] Rows = products (photo thumbnail + name in first column)
  - [ ] Columns = variant combinations (Color/Size header)
  - [ ] Cells = stock quantity with color-coded bg:
    - [ ] Green bg if > 5
    - [ ] Yellow/amber bg if 3–5
    - [ ] Red bg if 0–2
  - [ ] Each cell is **inline-editable**: click → input focus → blur/enter → PATCH API call
  - [ ] Loading spinner in cell while saving
  - [ ] Success flash (green border pulse) on save
- [ ] Real-time update: if another user changes stock → cell updates via `stock:updated` socket ⚡

### ✅ Phase 7 Gate
- [ ] Create product with 4 variants → appears in grid with correct chips
- [ ] Edit variant price → price updates in all orders referencing that variant (verify no breakage)
- [ ] Set variant stock to 0 via matrix → pending orders with that variant become out_of_stock (cross-check Phase 3.4)
- [ ] Stock matrix: cell turns red at 2 → yellow at 4 → green at 6
- [ ] Inline edit: click cell → type 10 → enter → API saves → cell shows 10

---

## Phase 8 — Clients Page
> Goal: Customer database is viewable, taggable, searchable, with full order history.

### 8.1 — Clients Backend

- [ ] Confirm customer endpoints from Phase 3.5 are tested and stable
- [ ] `GET /api/v1/customers` must support: search by name/phone, filter by city, filter by tag, sort by totalOrders/lastOrderDate

### 8.2 — Clients Page (`/clients`)

- [ ] 🎨 Table layout with columns: Avatar+Name, Phone (with WhatsApp icon), City, Total Orders, Last Order, Tag pill, Actions
- [ ] Search bar: live search by name or phone (debounced 300ms)
- [ ] Tag filter: All / Normal / VIP / Blacklisted (pill tabs)
- [ ] City filter dropdown
- [ ] Sort: by total orders, by last order date
- [ ] Click history button → `<CustomerHistoryModal>` (built in Phase 4.5)
- [ ] **Create Client** button → mini form modal: name, phone, city, address
- [ ] Tag pill is clickable (admin/supervisor only) → inline dropdown to change tag
- [ ] Blacklisted customers: row has subtle red left border as visual indicator

### ✅ Phase 8 Gate
- [ ] Search "06661" → shows only matching phone numbers
- [ ] Filter VIP → shows only VIP tagged customers
- [ ] Click history on customer with 5 orders → modal shows all 5 with correct statuses
- [ ] Create new client → appears in table immediately
- [ ] Change tag from Normal to VIP → tag pill updates instantly

---

## Phase 9 — Team, Roles & Assignment Engine
> Goal: Agents can be created, roles can be configured, auto-assignment works.

### 9.1 — Team Backend

- [ ] `GET /api/v1/users` — list with role, isOnline, stats (orders today, confirmation rate)
- [ ] `POST /api/v1/users` — create agent (hash password, assign role)
- [ ] `PATCH /api/v1/users/:id` — update agent info, reset password, toggle isActive
- [ ] `GET /api/v1/roles` — list with permission codes
- [ ] `POST /api/v1/roles` — create new role
- [ ] `PATCH /api/v1/roles/:id` — update permissions
- [ ] `GET /api/v1/assignment-rules` — current rule state
- [ ] `PATCH /api/v1/assignment-rules` — update strategy, bounceCount

### 9.2 — Agents Sub-page (`/team/agents`)

- [ ] Agent cards grid: photo + name + role badge + isActive toggle + isOnline dot + stats today
- [ ] Create Agent button → form modal: name, email, phone, password, role select, profile photo upload
- [ ] Edit agent → same modal pre-filled
- [ ] Deactivate agent → confirm dialog → agent can no longer log in, unassigned from pending orders

### 9.3 — Roles Sub-page (`/team/roles`)

- [ ] 🎨 Role cards: name + color badge + permission count
- [ ] Expand role → show all permissions as checkbox grid organized by section (Orders, Clients, Products, Team, Finance, Atelie)
- [ ] Edit permissions inline → save button → confirm change
- [ ] Create new role button → name input + permissions checkboxes
- [ ] Protect system roles (Admin) — cannot delete, can only edit permissions with warning

### 9.4 — Assignment Rules Sub-page (`/team/assignment`)

- [ ] Toggle: Enable/Disable auto-assignment
- [ ] Strategy selector: Round-Robin | By Product
- [ ] Bounce count slider/input: 1–10 orders per agent before rotating
- [ ] Visual preview: show current queue position (Agent 1 has 1 more before Agent 2)
- [ ] Commission rules section: per agent, set onConfirm MAD + onDeliver MAD (inline edit table)
- [ ] Test button: simulate "5 new orders arrive" → show which agent gets what

### 9.5 — Auto-Assignment Engine Backend

- [ ] Implement Redis distributed lock (system design Section 11.3)
- [ ] Implement `autoAssign(orderId)` function (system design Section 11.2)
- [ ] Wire into order creation flow: if rule.isActive → call autoAssign after order created
- [ ] Wire into Youcan webhook: autoAssign called after order saved
- [ ] Emit `order:assigned` socket event + trigger agent sound

### ✅ Phase 9 Gate
- [ ] Create agent with Agent role → can log into Call Center, cannot access Dashboard
- [ ] Create custom role with only ORDERS_VIEW → user sees orders but cannot edit
- [ ] Enable auto-assignment, bounceCount=2 → create 6 orders → agent1 gets 1,2 → agent2 gets 3,4 → agent1 gets 5,6
- [ ] Concurrent test: 3 orders arrive simultaneously → no duplicate assignments (Redis lock works)
- [ ] Commission:  deliver 3 orders (15 MAD each) → commission card shows 65 MAD
- [ ] Deactivate agent → their pending orders appear as "unassigned" in orders table

---

## Phase 10 — Youcan Integration
> Goal: Orders flow from Youcan store into CRM automatically and in real-time.

### 10.1 — Store Connection Backend

- [ ] `POST /api/v1/integrations/store` — save encrypted API key, call Youcan /me, verify and get store info
- [ ] `GET /api/v1/integrations/store` — list connected stores with status
- [ ] `DELETE /api/v1/integrations/store/:id` — disconnect store
- [ ] `POST /api/webhooks/youcan` — HMAC-SHA256 verified webhook handler:
  - [ ] Parse payload → normalize phone → upsert customer → check duplicate → create order
  - [ ] Trigger auto-assignment
  - [ ] Emit `order:new` socket event
  - [ ] Play sound for admin
  - [ ] Log to ImportLog
- [ ] `POST /api/v1/products/import/youcan/preview` — fetch product list from Youcan API
- [ ] `POST /api/v1/products/import/youcan` — import selected products with variants + photos (Bull queue job)

### 10.2 — Integrations Store Sub-page (`/integrations/store`)

- [ ] Connection card: API key input (masked) + "Connect Store" button + status badge
- [ ] Connected stores list: store name, brand, connected date, order count, webhook status (live indicator)
- [ ] Import section per store:
  - [ ] Number of orders to import on sync input
  - [ ] Brand filter dropdown
  - [ ] Product checklist (from Youcan product list)
  - [ ] "Run Import" button → progress indicator → results (imported N / skipped N / errors N)
- [ ] Import logs table: timestamp, imported count, skipped, errors, note

### ✅ Phase 10 Gate
- [ ] Connect Youcan store with valid API key → store name appears
- [ ] Send test webhook from Youcan → order appears in CRM within 500ms ⚡
- [ ] New order sound plays for admin ⚡
- [ ] Duplicate order (same Youcan ID) → skipped, logged
- [ ] Phone normalization: Youcan sends "0661234567" → CRM stores "+212661234567"
- [ ] Import 5 products from Youcan → photos uploaded to Cloudinary, variants created
- [ ] Auto-assignment fires on webhook-created orders

---

## Phase 11 — Coliix Integration
> Goal: Labels created, shipping status syncs in real-time, returns validated.

### 11.1 — Coliix API Backend

- [ ] Store Coliix API key in settings (encrypted)
- [ ] `POST /api/v1/orders/:id/coliix` — validate order, push to Coliix, store trackingCode, update shippingStatus, emit socket event
- [ ] `POST /api/webhooks/coliix` — receive status updates, map to ShippingStatus enum (system design Table 10.3), update order, write ShippingLog, emit socket event
- [ ] `GET /api/v1/integrations/delivery/cities` — return ShippingCity list
- [ ] `POST /api/v1/integrations/delivery/cities/import` — CSV import of cities with fees
- [ ] `PATCH /api/v1/integrations/delivery/cities/:id` — update fee inline

### 11.2 — Delivery Sub-page (`/integrations/delivery`)

- [ ] Coliix API key connection card (same pattern as Youcan)
- [ ] 🎨 Shipping cities table: city name, Arabic name, fee (MAD), editable inline
- [ ] Import CSV button → file picker → upload → preview changes → confirm import
- [ ] "Sync from Coliix" button to pull official city list

### 11.3 — Return Validation Sub-page (`/integrations/returns`)

- [ ] `GET /api/v1/orders/returns` — orders with shippingStatus = RETURNED pending validation
- [ ] List view: order ref, customer, product, tracking code, Coliix return status
- [ ] Search bar: by tracking code, phone, city
- [ ] Validate button per row → PATCH API → shippingStatus = RETURN_VALIDATED → restock variant → emit stock:updated
- [ ] Scan QR button → camera access → read tracking code → find order → validate
- [ ] Bulk validate selected rows

### ✅ Phase 11 Gate
- [ ] Confirmed order → click "Send to Coliix" → ✅ appears, trackingCode stored
- [ ] Send to Coliix on unconfirmed order → ❌ with error "Order not confirmed"
- [ ] Coliix webhook fires with status "delivered" → order row updates in real-time ⚡
- [ ] Coliix webhook fires with status "returned" → order appears in returns validation page
- [ ] Validate return → variant stock increases by order quantity
- [ ] City not in list → warning in Call Center order modal
- [ ] CSV import of 50 cities → all appear in city list

---

## Phase 12 — Analytics Page
> Goal: Full analytics with filters, all charts, agent and product performance reports.

### 12.1 — Analytics Backend

- [ ] `GET /api/v1/kpi/analytics` — comprehensive data: all KPIs + agent breakdown + product breakdown + city breakdown + order pipeline funnel + return analysis
- [ ] Uses `kpiCalculator.ts` + `filterBuilder.ts` — no new formulas
- [ ] Caches with 60s TTL (analytics queries are expensive)
- [ ] Commission report: per agent, period totals

### 12.2 — Analytics Page (`/analytics`)

- [ ] Mount `<GlobalFilterBar>` (all 4 filters)
- [ ] 🎨 **Overall KPIs row**: same `<KPICard>` components as Dashboard (same data, same formulas, just on a different page)
- [ ] 🎨 **Order Pipeline** — horizontal funnel chart (inspired by Nexo Tech reference):
  - [ ] Stages: Received → Confirmed → Shipped → Delivered → Returned
  - [ ] Each stage: big number + % of previous stage
  - [ ] Stacked area showing drop-off between stages
- [ ] 🎨 **Agent Performance** — bar chart + table below:
  - [ ] Bar chart: agents on X-axis, confirmation rate on Y-axis, delivery rate second bar
  - [ ] Table: agent name + orders + conf rate + delivery rate + commission MAD
  - [ ] Sortable by any column
- [ ] 🎨 **Return Analysis**:
  - [ ] Returns by product: ranked list with count
  - [ ] Returns by reason: donut chart
  - [ ] Returns by agent: bar chart (which agent had most returns)
- [ ] 🎨 **Product KPIs** — table: product name + orders + conf rate + delivery rate + revenue
- [ ] 🎨 **Shipping Details**:
  - [ ] Average delivery time (days) per city
  - [ ] City-level delivery rate map/table
- [ ] 🎨 **Commission Report** — table per agent: conf count, delivery count, total commission MAD
- [ ] Export button (top right): download current view as CSV

### ✅ Phase 12 Gate
- [ ] Analytics KPIs match Dashboard KPIs exactly when same date filter applied
- [ ] Apply agent filter on Analytics → agent performance chart focuses on that agent
- [ ] Pipeline funnel numbers add up logically (delivered ≤ confirmed ≤ received)
- [ ] Commission report: manually verify 1 agent's total against Call Center commission card
- [ ] Export to CSV: all columns present, numbers correct

---

## Phase 13 — Settings, Notifications & Sound System
> Goal: CRM is customizable, sounds work per role, notifications display correctly.

### 13.1 — Settings Backend + Page

- [ ] `GET /api/v1/settings` — return all key-value settings
- [ ] `PATCH /api/v1/settings` — batch update settings
- [ ] Settings page (`/settings`) with sections:
  - [ ] **Branding**: logo upload + preview (Cloudinary upload, updates TopBar logo live)
  - [ ] **Security**: change admin password form (current password required)
  - [ ] **Localization**: timezone select, date format select, price format select
  - [ ] **Appearance**: primary color picker (brown shades only, 6 presets) — applies CSS var live
- [ ] All setting changes emit socket event to refresh settings for all connected users

### 13.2 — Sound System

- [ ] Install Howler.js
- [ ] Create `src/lib/sounds.ts`:
  - [ ] Preload 4 sound files on app mount
  - [ ] `sounds.play('newOrder')` — chime, admin only
  - [ ] `sounds.play('delivered')` — success, admin only
  - [ ] `sounds.play('assignment')` — ping, assigned agent only
  - [ ] `sounds.play('callback')` — alert, agent + admin
- [ ] Wire sounds into socket event handlers (Phase 2.3 hooks)
- [ ] Sound on/off toggle in user preferences (stored in localStorage)
- [ ] Test: new order webhook → admin hears chime → agent hears nothing

### 13.3 — Notification Bell

- [ ] `GET /api/v1/notifications` — last 20 notifications for current user (unread count)
- [ ] `PATCH /api/v1/notifications/:id/read` — mark as read
- [ ] `PATCH /api/v1/notifications/read-all`
- [ ] Notification bell in TopBar: unread count badge (brown bg)
- [ ] Dropdown panel: notification list with icon + message + timestamp + unread dot
- [ ] Click notification → navigate to relevant order

### ✅ Phase 13 Gate
- [ ] Upload logo → appears in TopBar within 1 second across all open browser tabs ⚡
- [ ] Change date format → all date displays in CRM update immediately
- [ ] New order: admin hears chime, agent hears nothing
- [ ] Order assigned: only that agent's browser plays ping sound
- [ ] Notification bell shows unread count → click → dropdown shows notifications → click one → navigates to order
- [ ] Sound toggle: disable sounds → no sounds play even when events arrive

---

## Phase 14 — Atelie Module
> Goal: Workshop employee management is functional.

### 14.1 — Atelie Backend

- [ ] `GET /api/v1/atelie/employees` — list with current week attendance + salary status
- [ ] `POST /api/v1/atelie/employees` — create employee
- [ ] `PATCH /api/v1/atelie/employees/:id` — update employee info
- [ ] `POST /api/v1/atelie/attendance` — record weekly attendance (daysPresent for week starting X)
- [ ] `GET /api/v1/atelie/salary` — list salary payments with paid/unpaid status per week
- [ ] `PATCH /api/v1/atelie/salary/:id/pay` — mark week as paid

### 14.2 — Atelie Employees Sub-page (`/atelie/employees`)

- [ ] Employee list: photo + name + weekly salary + phone + isActive
- [ ] Create employee button → form modal
- [ ] Per employee: attendance card for current week (7-day calendar, click to toggle present/absent)
- [ ] Salary table: week → days present → calculated salary → Paid/Unpaid button
- [ ] Salary history: expandable per employee showing past 10 weeks

### 14.3 — Coming Soon Placeholders

- [ ] `/atelie/stock` → `<ComingSoonPage>` with "Stock management — coming soon" message + illustration
- [ ] `/atelie/production` → `<ComingSoonPage>` with "Production tracking — coming soon"

### ✅ Phase 14 Gate
- [ ] Create employee with salary 500 MAD/week
- [ ] Record 4 days attendance → calculated salary shows 400 MAD (500 × 4/5)
- [ ] Mark week as paid → row shows green "Paid" badge
- [ ] Salary history shows last 4 weeks correctly

---

## Phase 15 — Polish, Performance & Deploy
> Goal: Production-ready. Fast. Stable. Beautiful.

### 15.1 — Frontend Performance Pass

- [ ] Audit all React Query queries — verify staleTime and cacheTime are appropriate
- [ ] Add `React.memo` to table row components (prevent re-render on unrelated socket events)
- [ ] Lazy-load all page components with `React.lazy` + `Suspense` skeleton
- [ ] Verify initial page load < 2 seconds (Lighthouse audit)
- [ ] Verify orders table renders 100 rows < 100ms (Chrome Performance tab)
- [ ] Optimize Cloudinary image sizes (auto-format, auto-quality on all `<img>` tags)
- [ ] Add error boundaries around all pages (graceful error display, not blank screen)

### 15.2 — Design Polish Pass

- [ ] Review every page against design references — check: spacing consistency, font sizes, card shadows, border radii
- [ ] Verify all status badges match statusColors.ts (no inconsistencies)
- [ ] Verify `<GlobalFilterBar>` looks identical on Dashboard, Orders, Analytics, Call Center
- [ ] Check dark-hover states on all interactive elements (buttons, table rows, nav items)
- [ ] Check responsive layout at 1280px, 1440px, 1920px widths
- [ ] Verify glass card blur effect renders correctly on Chrome + Firefox + Safari
- [ ] Animated entry for modals (scale + fade in) — verify smooth 60fps
- [ ] Check all empty states have illustrations/icons (no blank white boxes)

### 15.3 — Real-Time Stress Test

- [ ] Open 5 browser tabs (admin + 4 agents)
- [ ] Send 10 webhook orders in 5 seconds (simulate via script)
- [ ] Verify: all 5 tabs update within 500ms per event ⚡
- [ ] Verify: no duplicate orders created (auto-assignment concurrency test)
- [ ] Verify: KPI cards on dashboard update for all 5 tabs after each order
- [ ] Verify: sound plays only in correct role's tab

### 15.4 — Security Review

- [ ] Verify RBAC: create an Agent user → try to GET /api/v1/kpi/dashboard → must receive 403
- [ ] Verify RBAC: Agent tries to PATCH /api/v1/orders/:id/assign → 403
- [ ] Test rate limiting: 6 login attempts → lockout message shown
- [ ] Verify no sensitive data in JWT payload (only userId, roleId)
- [ ] Verify refresh tokens are httpOnly cookies (not accessible via JS)
- [ ] Verify Youcan webhook rejects requests with invalid HMAC signature
- [ ] Check no internal paths or stack traces exposed in error responses

### 15.5 — Deployment

- [ ] Set up VPS (Hetzner CX21 or Railway)
- [ ] Configure Nginx as reverse proxy with SSL (Let's Encrypt)
- [ ] Deploy PostgreSQL (managed: Railway or Supabase)
- [ ] Deploy Redis (Upstash free tier)
- [ ] Set up PM2 in cluster mode (2 workers)
- [ ] Configure all environment variables from `.env.example`
- [ ] Run `prisma migrate deploy` on production DB
- [ ] Run seed script (admin user + default roles)
- [ ] Deploy frontend static files to Nginx
- [ ] Set up UptimeRobot monitoring on `/api/health`
- [ ] Set up Sentry (frontend + backend error tracking)
- [ ] Final smoke test: login → create order → change status → socket fires → KPI updates

### ✅ Final Gate — Ship Checklist
- [ ] Lighthouse performance score ≥ 85
- [ ] All 15 phase gates passed
- [ ] Zero console errors on any page
- [ ] Login → full workflow (receive order → confirm → ship → deliver) works end-to-end
- [ ] Admin can see all pages; Agent can only see Call Center, Products, Clients
- [ ] Youcan webhook fires → order appears < 500ms
- [ ] Coliix webhook fires → shipping status updates < 500ms
- [ ] Sound effects work in production (test on actual device)
- [ ] Mobile layout acceptable at 390px width (iPhone size)
- [ ] Uptime monitor green

---

## Dependency Map

```
Phase 0 (Design System)
    └──→ Phase 1 (Auth + Layout)
              └──→ Phase 2 (Backend Foundation)
                        └──→ Phase 3 (Orders Backend)
                                  └──→ Phase 4 (Orders Frontend)
                                  └──→ Phase 5 (Call Center)
                                  └──→ Phase 6 (Dashboard)
                                  └──→ Phase 7 (Products)
                                  └──→ Phase 8 (Clients)
                        └──→ Phase 9 (Team + Assignment)
                                  └──→ Phase 10 (Youcan)
                                            └──→ Phase 6 (Dashboard live orders)
                        └──→ Phase 11 (Coliix)
                                  ← Requires: Phase 7 (stock) + Phase 4 (orders table)
                        └──→ Phase 12 (Analytics)
                                  ← Requires: Phase 3, 9, 10, 11 all done
Phase 13 (Sounds/Notifications) ← Can run parallel with Phase 12
Phase 14 (Atelie) ← Independent, can run anytime after Phase 1
Phase 15 (Polish + Deploy) ← Always last
```

---

## Quick Stats

| Total Phases | 16 (0–15) |
|---|---|
| Estimated Days | 75 |
| Total Checkable Tasks | ~280 |
| Phase Gate Tests | 16 |
| Real-time Critical Tasks (⚡) | 18 |
| Design-specific Tasks (🎨) | 34 |

---

*Document version: 1.0 · 2026-04-13 · Companion to: `anaqatoki-crm-spec.md` + `anaqatoki-system-design.md`*
