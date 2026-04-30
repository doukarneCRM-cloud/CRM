# Anaqatoki CRM — Architecture Overview

> Reference document for cloning, refactoring, and reasoning about the system.
> Read top-to-bottom once; keep handy as a desk reference.

## 1. At a glance

Anaqatoki is a **B2B order fulfillment + fashion atelier CRM** serving order
confirmation agents, shipping supervisors, and a connected fabric workshop.
Top three features:

1. **Order confirmation & commission payouts** — agents confirm orders from
   YouCan e-commerce (webhook + poller), WhatsApp, or manual entry, with
   real-time status tracking and per-agent performance analytics.
2. **Carrier integration (Coliix V1 + V2)** — V1 single API key (legacy),
   V2 multi-hub with idempotent push, append-only event log, adaptive polling
   fallback, and admin-editable status mapping.
3. **Atelie (workshop)** — sample approvals, production runs (cut → sew →
   finish → QC → packed) with labor + material costing, employee attendance,
   task boards.

Stack: Fastify + Prisma + Postgres + Redis backend, React + Vite + Zustand
frontend, Bull queues, Socket.IO realtime, Evolution API for WhatsApp.

---

## 2. Stack & deployment

| Component | Technology | Notes |
|---|---|---|
| Backend | Fastify, TypeScript, Prisma ORM | ~22k LOC, ~22 modules |
| Frontend | React 18, Vite, Zustand, Tailwind | SPA, role-gated pages |
| Database | PostgreSQL (Railway) | 70+ Prisma models |
| Cache / Queue | Redis (Railway) + Bull | Sessions, rate-limit, job queues |
| Real-time | Socket.IO 4.x | Rooms: `agent:<id>`, `orders:all`, `dashboard`, `admin`, `whatsapp:monitor`, `tasks:shared` |
| Background jobs | Bull (Redis-backed) | `callbackAlert`, `whatsapp:send`, `coliixV2:push`, `coliixV2:ingest`, `coliixV2:poll`, `youcanSync` |
| Webhooks | YouCan / Coliix V1 / V2 / Evolution | Path-secret + HMAC-SHA256 auth |
| Hosting | Railway services | backend, frontend, Postgres, Redis, Evolution (third-party) |

---

## 3. Repo layout

```
.
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts                     (Fastify init, plugin registration)
│   │   │   ├── modules/
│   │   │   │   ├── auth/                    (JWT, refresh, RBAC)
│   │   │   │   ├── orders/                  (list, create, confirm, cancel, merge)
│   │   │   │   ├── customers/               (lookup, upsert, WhatsApp opt-out)
│   │   │   │   ├── products/                (catalog, variants, pricing)
│   │   │   │   ├── team/                    (users, roles, permissions, online)
│   │   │   │   ├── integrations/            (YouCan, Coliix V1 — legacy module)
│   │   │   │   │   └── coliixV2/            (V2 client, services, workers, routes)
│   │   │   │   ├── analytics/               (delivery / confirmation / profit tabs)
│   │   │   │   ├── automation/              (templates, rules, dispatcher)
│   │   │   │   ├── whatsapp/                (sessions, inbox threads, message logs)
│   │   │   │   ├── money/                   (commission rules, payment ledger)
│   │   │   │   ├── returns/                 (RMA verification)
│   │   │   │   ├── notifications/           (in-app bell)
│   │   │   │   ├── broadcasts/              (admin push popups)
│   │   │   │   ├── shippingCities/          (delivery zone + price)
│   │   │   │   ├── shippingStatusGroups/    (admin pill grouping)
│   │   │   │   ├── atelie/                  (employees, attendance, salary)
│   │   │   │   ├── atelieStock/             (materials, fabric rolls)
│   │   │   │   ├── atelieTasks/             (kanban tasks)
│   │   │   │   ├── atelieTests/             (samples, costing)
│   │   │   │   ├── atelieProduction/        (runs, stages, labor)
│   │   │   │   └── admin/                   (settings, webhook health)
│   │   │   ├── shared/
│   │   │   │   ├── socket.ts                (Socket.IO init, rooms, emit helpers)
│   │   │   │   ├── jwt.ts                   (access/refresh tokens)
│   │   │   │   ├── prisma.ts                (singleton)
│   │   │   │   ├── redis.ts                 (singleton)
│   │   │   │   ├── encryption.ts            (AES-256-GCM for API keys)
│   │   │   │   ├── env.ts                   (boot-time env validation)
│   │   │   │   ├── queue.ts                 (Bull queue definitions)
│   │   │   │   └── middleware/              (verifyJWT, requirePermission)
│   │   │   ├── utils/
│   │   │   │   ├── kpiCalculator.ts         (CANONICAL KPI source)
│   │   │   │   ├── filterBuilder.ts         (CANONICAL Prisma where builder)
│   │   │   │   ├── autoAssign.ts            (rule-based agent routing)
│   │   │   │   └── conditionEvaluator.ts    (automation rule conditions)
│   │   │   └── jobs/
│   │   │       ├── callbackAlert.job.ts
│   │   │       ├── whatsappSend.job.ts
│   │   │       ├── coliixPush.job.ts
│   │   │       └── registerColiixV2Workers.ts
│   │   └── prisma/
│   │       ├── schema.prisma                (all models + enums)
│   │       ├── migrations/                  (24 SQL migrations)
│   │       └── seed.ts                      (dev roles + permissions)
│   │
│   └── frontend/
│       └── src/
│           ├── pages/
│           │   ├── dashboard/               (KPI cards, leaderboard, trend)
│           │   ├── orders/                  (list, detail, confirm modal)
│           │   ├── call-center/             (agent workbench)
│           │   ├── analytics/               (Delivery / Confirmation / Profit tabs)
│           │   ├── integrations/            (Coliix V2 setup, mapping editor)
│           │   ├── money/                   (commission rules, payments)
│           │   ├── returns/                 (RMA verification)
│           │   ├── automation/              (templates, rules, logs)
│           │   ├── atelie/                  (employees, materials, tasks)
│           │   ├── production/              (runs, stages, costs)
│           │   ├── products/                (catalog + variants)
│           │   ├── team/                    (users, roles)
│           │   ├── settings/                (cities, status groups)
│           │   └── auth/                    (login)
│           ├── store/
│           │   ├── authStore.ts             (user, JWT, hasPermission)
│           │   ├── filterStore.ts           (chips: cities, agents, dates, statuses)
│           │   ├── onlineStore.ts           (online users)
│           │   └── toastStore.ts            (notifications)
│           ├── services/
│           │   ├── api.ts                   (axios + JWT refresh interceptor)
│           │   ├── socket.ts                (Socket.IO singleton + reconnect)
│           │   └── <domain>Api.ts           (per-module REST clients)
│           ├── components/
│           │   ├── ui/                      (CRMButton, GlassModal, StatusBadge…)
│           │   └── GlobalFilterBar.tsx      (chip dropdowns)
│           ├── hooks/                       (useAuth, useFilters, useSocket…)
│           └── constants/
│               ├── permissions.ts           (PERMISSIONS keys)
│               └── orderStatuses.ts         (enum labels + colors)
│
├── docs/                                    (this file lives here)
├── package.json                             (workspace root)
└── README.md
```

---

## 4. Data model

The 15 most important models. Names are exact (Prisma).

| Model | Purpose | Key fields | Key relations |
|---|---|---|---|
| **User** | Team member login + role + presence | `id`, `email`, `passwordHash`, `roleId`, `isActive`, `lastSeenAt` | → Role; owns many Orders via `agentId` |
| **Role** | Permission grouping | `id`, `name`, `label` | RolePermission[] → Permissions |
| **Permission** | Fine-grained capability | `id`, `key` (e.g. `orders:view`) | via RolePermission |
| **Customer** | Contact for orders | `fullName`, `phone` (+212 form), `phoneDisplay` (06…), `city`, `address`, `whatsappOptOut` | owns Orders |
| **Order** | Fulfillment unit | `reference` (ORD-YY-XXXXX), `source`, `customerId`, `agentId`, `confirmationStatus`, `shippingStatus`, `total`, `confirmedAt`, `cancelledAt`, `unreachableAt`, `deliveredAt`, `labelSentAt`, `coliixTrackingId` (V1), `coliixRawState` | owns OrderItem[], OrderLog[], Shipment[] (V2), MessageLog[] |
| **OrderItem** | Line in order | `orderId`, `variantId`, `quantity`, `unitPrice`, `total` | → ProductVariant |
| **OrderLog** | Audit trail | `type` (confirmation/shipping/system), `action`, `performedBy`, `userId`, `meta`, `createdAt` | → Order, User? |
| **Product** | SKU master | `sku`, `name`, `basePrice`, `isPlaceholder`, `youcanId`, `storeId` | owns ProductVariant[] |
| **ProductVariant** | Color × size combo | `productId`, `color`, `size`, `sku`, `stock`, `price`, `costPrice`, `youcanId` | → Product; owns OrderItem[] |
| **Store** | YouCan store + OAuth tokens | `name`, `accessToken`, `refreshToken`, `isActive`, `isConnected`, `lastSyncAt`, `fieldMapping` (JSON) | owns Products, Orders, CarrierAccount[] |
| **Carrier** | Shipping provider registry | `code` (`coliix_v2`), `label` | owns CarrierAccount[] |
| **CarrierAccount** | Coliix hub × store + secrets | `carrierId`, `storeId?`, `hubLabel`, `apiBaseUrl`, `apiKey` (encrypted), `webhookSecret`, `isActive` | owns Shipment[], CarrierCity[] |
| **Shipment** | V2 parcel (1:N with Order) | `orderId`, `accountId`, `trackingCode`, `idempotencyKey`, `state` (ShipmentState), `rawState`, `cod`, `pushedAt`, `deliveredAt`, `nextPollAt` | owns ShipmentEvent[] |
| **ShipmentEvent** | Append-only event log | `shipmentId`, `source` (webhook/poll/push/manual), `rawState`, `mappedState`, `occurredAt`, `payload` (JSON), `dedupeHash` | → Shipment |
| **ShippingCity** | Delivery zone + default fee | `name`, `price`, `zone`, `isActive` | used in order forms |

**Important enums:**
- `OrderSource`: `youcan | whatsapp | instagram | manual`
- `ConfirmationStatus`: `pending | awaiting | confirmed | cancelled | unreachable | callback | …`
- `ShippingStatus` (V1 + still used for KPIs): `not_shipped | label_created | picked_up | in_transit | out_for_delivery | delivered | attempted | returned | return_validated | return_refused | exchange | lost | destroyed`
- `ShipmentState` (V2): `pending | push_failed | pushed | picked_up | in_transit | out_for_delivery | delivered | refused | returned | lost | cancelled`

---

## 5. Backend modules

| Module (`apps/backend/src/modules/`) | Purpose | Key endpoints | Talks to |
|---|---|---|---|
| `auth` | JWT + refresh + RBAC | `POST /auth/login`, `POST /auth/refresh` | Redis |
| `orders` | CRUD, confirm, cancel, merge, assign | `GET /orders`, `PATCH /orders/:id/status`, `POST /orders/merge` | kpiCalculator, autoAssign, Socket.IO |
| `customers` | Lookup + upsert | `GET /customers`, `POST /customers` | YouCan sync |
| `products` | Catalog + variants | `GET /products`, `POST /products/:id/variants` | YouCan import |
| `team` | Users + roles + presence | `GET /team/users`, `POST /team/users` | Socket.IO |
| `integrations` | YouCan OAuth, V1 webhook + poller | `POST /integrations/coliix/webhook`, `POST /integrations/youcan/connect` | YouCan API, Coliix V1 API |
| `integrations/coliixV2` | V2 accounts, shipments, mapping, webhook | `POST /coliixv2/accounts`, `POST /coliixv2/shipments/:orderId`, `POST /coliixv2/webhook/:accountId/:secret` | Coliix V2 API, Bull, Redis (dedup) |
| `analytics` | Delivery / Confirmation / Profit tab data | `GET /analytics/delivery`, `GET /analytics/confirmation` | filterBuilder, Prisma |
| `automation` | Templates, rules, dispatcher | `GET /automation/templates`, `POST /automation/dispatch/:trigger` | Bull (whatsapp:send) |
| `whatsapp` | Sessions, inbox, message logs | `GET /whatsapp/sessions`, `GET /whatsapp/threads` | Evolution API, Socket.IO |
| `broadcasts` | Admin push popups | `POST /broadcasts`, `PATCH /broadcasts/:id/ack` | Socket.IO |
| `notifications` | In-app bell | `GET /notifications` | Socket.IO |
| `money` | Commission rules + payments | `GET /money/commissions`, `POST /money/payments` | — |
| `returns` | RMA verification | `PATCH /returns/:id/verify` | OrderLog, Socket.IO |
| `shippingCities` | Delivery zones + price editor | `GET /shippingCities`, `POST /shippingCities` | — |
| `shippingStatusGroups` | Admin pill grouping | `GET /shippingStatusGroups` | — |
| `atelie` | Employees, attendance, salary | `GET /atelie/employees` | Socket.IO |
| `atelieStock` | Materials, fabric rolls | `POST /atelie/materials/:id/movements` | — |
| `atelieTasks` | Kanban | `POST /atelie/tasks` | Socket.IO |
| `atelieTests` | Samples + costing | `PATCH /atelie/tests/:id/approve` | cost calc |
| `atelieProduction` | Runs, stages, labor | `PATCH /atelie/runs/:id/stages/:stage` | Socket.IO |
| `admin` | Settings, webhook health | `GET /admin/webhook-health` | WebhookEventLog |

---

## 6. Frontend pages

| Route | Component | Purpose | Key APIs | UI primitives |
|---|---|---|---|---|
| `/dashboard` | `DashboardPage.tsx` | KPI cards, agent leaderboard, trend | `dashboardApi.getKpis()` | KPICard, sparklines, Socket.IO `kpi:refresh` |
| `/orders` | `OrdersPage.tsx` | Paginated list + bulk actions | `ordersApi.list()`, `ordersApi.summary()` | OrdersTable, GlobalFilterBar |
| `/call-center` | `CallCenterPage.tsx` | Agent workbench (left list + right detail) | `ordersApi.getById()`, `ordersApi.confirm()` | Inline confirm form, WhatsApp thread inline |
| `/analytics` | `AnalyticsPage.tsx` | Tabs: Delivery / Confirmation / Profit | `analyticsApi.*` | recharts, date+compare picker |
| `/integrations` | `IntegrationsPage.tsx` | YouCan / Coliix V1 / Coliix V2 setup tabs | `coliixV2Api.*`, `providersApi.*` | ConnectWizard, MappingsModal |
| `/products` | `ProductsPage.tsx` | Catalog + variants + bulk import | `productsApi.list()` | image preview, variant grid |
| `/money` | `MoneyPage.tsx` | Commission rules + payment ledger | `moneyApi.*` | rule builder, ledger table |
| `/returns` | `ReturnsPage.tsx` | RMA verification | `returnsApi.getPending()` | camera widget, condition picker |
| `/automation` | `AutomationPage.tsx` | Templates + rules + dispatcher logs | `automationApi.*` | rich-text editor, JSON condition builder |
| `/atelie` | `AteliePage.tsx` | Employees / Materials / Tasks / Attendance | `atelieApi.*` | Kanban (dnd) |
| `/production` | `ProductionPage.tsx` | Runs + stages + labor | `productionApi.*` | stage timeline |
| `/team` | `TeamPage.tsx` | User roster + role editor | `teamApi.*` | permission grid |
| `/settings` | `SettingsPage.tsx` | Status groups + cities | `shippingStatusGroupsApi.*` | drag-drop pill reorder |
| `/auth/login` | `LoginPage.tsx` | Login form | `authApi.login()` | — |

---

## 7. Authentication & permissions

**Tokens:**
- **Access** (~30 min): in-memory only (Zustand `authStore.accessToken`), sent as `Authorization: Bearer …`.
- **Refresh** (~7 days): persisted to localStorage. Rotated on every refresh call.
- **Refresh flow**: axios interceptor catches 401 → `POST /auth/refresh` → replaces access token → retries original request.

**RBAC chain:**
`User → Role → RolePermission[] → Permission`

**Permission keys** (selection — full list in `apps/frontend/src/constants/permissions.ts`):
```
orders:view|create|edit|delete|export|assign
confirmation:view|update_status|add_note
shipping:view|push|return_validate
products:view|create|edit|delete  stock:adjust
clients:view|edit|delete  team:view|create|edit|delete|manage_roles
analytics:view  dashboard:view
integrations:view|manage  settings:view|edit
atelie:view|manage  atelie:fabric:view|manage
production:view|manage|finish|cost:view
call_center:view  money:view|manage  returns:verify
automation:view|manage|monitor
whatsapp:view|connect  broadcasts:manage
```

**Default role bundles:**
- **admin** — all keys
- **supervisor** — orders + confirmation + analytics + dashboard + team:view + money:view + returns + whatsapp:view + …
- **agent** — call_center:view + confirmation:* + products:view + whatsapp:connect
- **shipping** — shipping:* + orders:view + products:view + returns:verify
- **atelie** — atelie:* + production:* + atelie:fabric:*

**Frontend gating:**
- Page-level: `<ProtectedRoute permission="orders:view">…</ProtectedRoute>` redirects unauthorized users to `/dashboard`.
- Button-level: `{useAuthStore.hasPermission('orders:edit') && <EditButton />}`.
- Fallback: if JWT payload has empty perms array, fall through to `ROLE_PERMISSIONS[user.role.name]` constant.

**Backend middleware:**
- `verifyJWT` — parses Bearer, verifies, attaches `request.user`.
- `requirePermission(key)` — single perm gate (403 on miss).
- `requireAnyPermission(...keys)` — OR logic for multi-role endpoints.

---

## 8. Real-time (Socket.IO)

**Init:** `apps/backend/src/shared/socket.ts:initSocket(app)` runs after Fastify HTTP server boots.
**Auth:** JWT in handshake `auth.token`, verified before any room join.

**Rooms:**

| Room | Members | Purpose |
|---|---|---|
| `agent:<userId>` | that user only | private (assignment, callbacks) |
| `orders:all` | every authenticated user | order created/updated/archived |
| `dashboard` | admin + supervisor | `kpi:refresh` broadcasts |
| `admin` | admin + supervisor | settings, atelie, leaderboard |
| `whatsapp:monitor` | admin + supervisor | message log live updates |
| `tasks:shared` | all | atelie shared tasks |

**Backend → frontend events:**

| Event | Payload | Listener purpose |
|---|---|---|
| `order:created` | `{ orderId, reference }` | refresh list (full re-fetch) |
| `order:updated` | `{ orderId }` | **surgical row patch** — fetch one via `ordersApi.getById`, merge into table state, no full re-fetch |
| `order:archived` | `{ orderId }` | drop row from view |
| `order:assigned` | `{ orderId, agentId, agentName }` | agent notification badge |
| `order:confirmed` / `order:delivered` | `{ orderId, reference }` | admin leaderboard ping, `kpi:refresh` |
| `kpi:refresh` | `{}` | dashboard re-queries KPI endpoint |
| `user:online` / `user:offline` | `{ userId, name, … }` | online dot in user list |
| `shipment:updated` (V2) | `{ shipmentId, orderId, state, rawState, trackingCode? }` | V2 shipment detail live update |
| `message_log:updated` | `{ id, status, error?, attempts }` | WhatsApp monitor live row |
| `whatsapp:rate_limited` | `{ limit, retryAfterSecs }` | global rate-limit toast |
| `task:created` / `task:updated` / `task:deleted` | `{ taskId, ownerId }` | Kanban card add/move/remove |
| `atelie:attendance:updated` | `{ employeeId, week }` | attendance grid refresh |
| `production:stage` | `{ runId, stage, status }` | timeline progress badge |

**Critical pattern — surgical row patch (no full refresh):**
- Old behaviour: any `order:updated` socket → full `ordersApi.list()` re-fetch → table re-renders → open modals close, scroll resets.
- New behaviour (`useOrders.ts`, `CallCenterTable.tsx`): `order:updated` → `ordersApi.getById(orderId)` → patch the matching row in-place → modals stay open, scroll preserved, selection preserved.

---

## 9. KPI & analytics — SINGLE SOURCE OF TRUTH

Two canonical files:
- **`apps/backend/src/utils/kpiCalculator.ts`** — dashboard KPIs (totalOrders, confirmationRate, deliveryRate, returnRate, mergedRate, revenue, profit). Every dashboard card calls these.
- **`apps/backend/src/modules/analytics/analytics.service.ts`** — analytics tab metrics (delivery / confirmation / profit cores). Reuses the same builder.
- **Both share** `apps/backend/src/utils/filterBuilder.ts:buildOrderWhereClause(filters, { dateField })`.

### Per-metric date semantics (Option C)

Each metric date-filters on the column that records **when that step actually happened** — not blindly on `createdAt`:

| Metric | Where filter | Date column |
|---|---|---|
| totalOrders | `isArchived: false` | `createdAt` |
| confirmed | `confirmationStatus: 'confirmed'` | `confirmedAt` |
| cancelled | `confirmationStatus: 'cancelled'` | `cancelledAt` |
| unreachable | `confirmationStatus: 'unreachable'` | `unreachableAt` |
| pending | `confirmationStatus: 'pending'` | `createdAt` (age of unconfirmed) |
| merged | `mergedIntoId IS NOT NULL` (with `isArchived: 'all'`) | `createdAt` |
| shipped | `labelSent: true` | `labelSentAt` |
| delivered | `shippingStatus: 'delivered'` | `deliveredAt` |
| returned | `shippingStatus IN return_validated, return_refused` | `returnVerifiedAt` |
| in_transit | `shippingStatus IN picked_up, in_transit, out_for_delivery` | — (snapshot, no date) |
| revenue | `shippingStatus = delivered`, sum(`total`) | `deliveredAt` |
| profit | revenue − sum(`shippingPrice`) | `deliveredAt` |

### Rates

- `confirmationRate = confirmed / totalOrders`
- `deliveryRate = delivered / confirmed`
- `returnRate = returned / shipped` (fallback `delivered + returned` if nothing shipped yet)
- `mergedRate = merged / (totalOrders + merged)`
- `avgConfirmationHours = avg(confirmedAt − createdAt)` over OrderLog confirmation events

### Why this matters

Without per-metric dating, "Confirmed today" wrongly counted orders **created** today but ignored orders confirmed today that arrived earlier. The fix means filter `date=today` correctly answers "agent activity today" for each metric.

---

## 10. Filter system

**Frontend store** (`apps/frontend/src/store/filterStore.ts`):
```ts
interface FilterState {
  cities: string[];
  agentIds: string[];
  productIds: string[];
  dateRange: { from: string; to: string };
  confirmationStatuses: string[];
  shippingStatuses: string[];   // legacy enum (UI uses coliixRawStates instead)
  coliixRawStates: string[];    // literal Coliix wordings — primary
  sources: string[];
}
```

**Component:** `GlobalFilterBar.tsx` — chip dropdowns at the top of Orders, Call Center, Analytics, Dashboard.

- Status chip pulls **literal Coliix wordings** via `GET /api/v1/integrations/coliix/states` (returns counts + synthetic "Not Shipped" / "Label Created" buckets).
- Cities chip fetches `GET /shippingCities`.
- Date chip = from/to range picker, defaults last 30 days.
- Source chip = static enum.

**Backend** (`filterBuilder.ts`):
```ts
buildOrderWhereClause(params, { dateField: 'createdAt' | 'confirmedAt' | … })
  → Prisma.OrderWhereInput
```
Handles archive flag, agent / city / product / source / status / coliixRawStates / search / per-metric date range.

**Flow:**
1. User toggles chip → `filterStore.toggleArrayFilter(...)`.
2. List page calls `ordersApi.list(filterStore)` → backend.
3. Backend `buildOrderWhereClause(params, { dateField: 'createdAt' })`.
4. Prisma query runs.
5. KPI endpoints use the same builder with `{ dateField: 'confirmedAt' }` etc. per metric.

---

## 11. Integrations

### YouCan (e-commerce)
**Files:** `apps/backend/src/modules/integrations/{integrations.service.ts, youcanClient.ts, integrations.routes.ts}`

- OAuth: redirect → exchange code → store encrypted tokens on `Store`.
- Order import paths: (1) webhook on order.create with HMAC-SHA256, (2) 5-minute background poller comparing `lastSyncAt`.
- Product sync: admin button pulls catalog, upserts Products + variants, sets `youcanId`, matches existing SKUs.
- `Store.fieldMapping` JSON maps YouCan checkout fields to CRM fields (e.g. checkout's "color" → variant.color).
- **State:** active.

### Coliix V1 (legacy)
**Files:** `coliix.service.ts`, `coliixClient.ts`, `coliixMapping.service.ts`, `coliixTracker.ts`

- Single global API key on `ShippingProvider`.
- Webhook: path-secret-authed; parses raw state; maps via `ColiixStatusMapping`; updates `Order.shippingStatus` + `Order.coliixRawState`.
- Push: `coliixClient.createLabel()` → returns tracking ID → sets `Order.coliixTrackingId, labelSent`.
- 5-minute poller for non-terminal orders.
- **State:** running in parallel with V2; deprecation pending full V2 migration.

### Coliix V2 (current)
**Module:** `apps/backend/src/modules/integrations/coliixV2/`

| File | Role |
|---|---|
| `coliixV2.client.ts` | Form-urlencoded POST to `/aga/seller/api-parcels`; ColiixV2Error; Morocco timezone parsing |
| `accounts.service.ts` | CarrierAccount CRUD, encrypted API key, `pickAccountForStore()` resolver |
| `cities.service.ts` | Sync from Coliix + CSV import + V1 ShippingCity bridge + isVilleKnown lookup |
| `mapping.cache.ts` | 60-s TTL three-tier cache (exact → normalized → first-token); auto-discover unknowns as null |
| `events.service.ts` | `ingestEvent()` transactional writer: ShipmentEvent + Shipment + Order + OrderLog + socket emit |
| `shipments.service.ts` | `createShipmentFromOrder()` orchestrator: pre-flight ville check, phone normalize, idempotency, push enqueue |
| `push.worker.ts` | Bull `coliixV2:push` worker: 5 retries exp backoff, flips `Order.labelSent`, marks `push_failed` on exhaust |
| `ingest.worker.ts` | Bull `coliixV2:ingest` worker (webhook): account-scoped lookup + cross-account fallback + `apply()` |
| `poll.worker.ts` | Bull `coliixV2:poll` worker (60-s tick): batch 50, adaptive cadence, `ingestTrackHistory()` |
| `webhook.controller.ts` | Constant-time secret compare, Redis NX dedupe, audit `WebhookEventLog`, enqueue and respond <50ms |
| `migration.service.ts` | One-click migrate V1 in-flight orders → V2 Shipments |
| `repush.service.ts` | Detect bug-tagged shipments, cancel + re-push with fixed data |
| `coliixV2.routes.ts` | All admin + webhook routes (zod-validated) |

- **Multi-hub:** `CarrierAccount` per (carrier × hub × store).
- **Idempotency:** Bull jobId per shipment + DB unique on (shipmentId, dedupeHash) + Redis NX SET on webhook hashes.
- **Adaptive polling:** terminal states clear `nextPollAt`; non-terminal recompute interval per state.
- **Append-only events:** every webhook + poll + push + manual action writes `ShipmentEvent`.
- **Bridge to V1 columns:** events also patch `Order.shippingStatus` + `Order.coliixRawState` + `Order.deliveredAt` + write OrderLog (`type='shipping'`) so legacy UI keeps working.
- **State:** active for new orders; admins can bulk-migrate V1 orders.

### WhatsApp (Evolution API)
**Files:** `apps/backend/src/modules/whatsapp/`, `automation/`, `jobs/whatsappSend.job.ts`

- Sessions: agent pairs phone via QR → backend stores `instanceName`.
- Outbound (automation-triggered): trigger fires → dispatcher creates `MessageLog` (deduped by hash) → enqueue `whatsapp:send` → worker calls Evolution API → updates status.
- Inbound: Evolution webhook → `WhatsAppThread` + `WhatsAppMessage`; agent can reply inline.
- Templates: one per AutomationTrigger enum (e.g. `shipping_delivered`); body has `{{ placeholders }}`.
- Rules: `AutomationRule` with conditions (priority + first/all overlap).
- **State:** live.

---

## 12. Background jobs (Bull)

| Queue | Job data | Producer | Worker | Trigger |
|---|---|---|---|---|
| `callbackAlert` | `{ orderId, agentId, dueAt }` | `orders.service` on callback set | `callbackAlert.job.ts` | scheduled by `dueAt`; emits `callback:reminder` |
| `whatsapp:send` | `{ messageLogId }` | `automation.dispatcher()` | `whatsappSend.job.ts` | calls Evolution API; retries 5×; emits `message_log:updated` |
| `coliixV2:push` | `{ shipmentId }` | `shipments.service.create…()` | `push.worker.ts` | sends parcel; flips Order.labelSent on success; resets on terminal fail |
| `coliixV2:ingest` | `{ accountId, tracking, rawState, driverNote, eventDateIso, payload }` | `webhook.controller` | `ingest.worker.ts` | matches Shipment, calls `ingestEvent()` |
| `coliixV2:poll` | `{}` (worker picks batch) | repeating job (60-s) | `poll.worker.ts` | fetches due shipments, ingests history |
| `youcanSync` | `{ storeId }` | timer (5 min) | `youcanSync.job.ts` | imports new orders since `lastSyncAt` |

All Bull queues backed by Redis. Failed jobs → DLQ after retry exhaustion. Workers run in-process (no separate worker pool today).

---

## 13. Order lifecycle

| Stage | User action | Columns set | Socket emit | KPI delta |
|---|---|---|---|---|
| 1. Created | Manual / YouCan webhook / WhatsApp | `createdAt`, `source`, `customerId` | `order:created` → `orders:all` | `totalOrders++` |
| 2. Assigned | Auto-rule or supervisor drag | `agentId`, `assignedAt` | `order:assigned` → `agent:<id>` | — |
| 3. Confirmed / Cancelled / Unreachable / Callback | Agent button (Call Center) | `confirmationStatus` + matching timestamp (`confirmedAt` / `cancelledAt` / `unreachableAt` / `callbackAt`) | `order:confirmed|cancelled` → admin, `kpi:refresh` → dashboard | `confirmationRate` updates |
| 4a. Push V1 | "Ship" button | `coliixTrackingId`, `labelSent=true`, `labelSentAt`, `shippingStatus='label_created'`, `trackingProvider='coliix'` | `order:updated` → `orders:all` | `shipped++` |
| 4b. Push V2 | "Send to Coliix" button | Shipment row created → Bull `coliixV2:push` enqueued. On success: `Shipment.state='pushed'`, `trackingCode`, mirrors to Order.coliixTrackingId, `labelSentAt` | `shipment:updated`, `order:updated` | `shipped++` |
| 5. Status updates | Coliix webhook / poll | `Shipment.state` + `rawState`, append `ShipmentEvent`, mirror `Order.shippingStatus` + `coliixRawState`, OrderLog row | `order:updated`, `shipment:updated`, `kpi:refresh` | intermediate (in_transit / out_for_delivery) |
| 6. Delivered | Coliix terminal status | `Shipment.deliveredAt`, `Order.deliveredAt`, `Order.shippingStatus='delivered'` | `order:delivered` → admin, `kpi:refresh` | `revenue` sum, `deliveryRate` |
| 7. Returned / Refused | Coliix bounce-back | `Shipment.state='returned'`/'refused'`, `Order.shippingStatus='returned'` (awaiting verify) | `order:updated` | `returnRate` denominator |
| 8. Return verified | Admin inspects parcel | `returnVerifiedAt`, `returnVerifiedById`, `Order.shippingStatus='return_validated|refused'` | `order:updated`, `kpi:refresh` | `returnRate` numerator |
| 9. Commission paid | Admin payment batch | `commissionPaid=true`, `commissionPaidAt` | — | money tab |
| 10. Archived | Merge / manual archive | `isArchived=true`, `mergedIntoId?` | `order:archived` | `mergedRate` if merged |

---

## 14. Known issues & tech debt

1. **V1 + V2 Coliix in parallel** — no documented sunset plan for V1. Action: set deprecation date, bulk-migrate, then remove V1 module.
2. **Mappings auto-discover bug** (recently patched) — auto-discovered rows now NULL instead of defaulting to `pushed` (which downgraded shipments). Re-seed migration applied. Audit prod periodically.
3. **KPI cache drift** — Dashboard KPIs Redis-cached 30 s; Analytics tabs uncached. Side-by-side comparison shows up to 30 s skew. Action: drop cache (Postgres is fast enough) OR cache both with same TTL OR socket-broadcast invalidation.
4. **Unused `filterStore.shippingStatuses`** — UI uses `coliixRawStates`; the enum-based field is dead code. Remove from store + persistence.
5. **Polling configs scattered** — V1: 5-min hardcoded in `coliixTracker.ts`; V2: 60-s base + adaptive in `poll.worker.ts`. Centralize via env or `Setting` table.
6. **24 migrations** — some reversions. Before next major release, squash pre-prod migrations into a baseline (production migrations stay separate).
7. **Evolution outage resilience** — When Evolution is down, queued WhatsApp messages eventually expire from Bull. Add heartbeat + retry button + DLQ dashboard.
8. **Order merge + agent reassignment** — Merging two orders from different agents doesn't prompt who keeps the keeper. Add an explicit step.

---

## Refactor priorities (suggested)

1. **Retire Coliix V1.** Migrate every in-flight V1 order → V2; remove `integrations/coliix*.ts` module + V1 routes; keep V1 webhook URL serving 410 Gone for ~30 days.
2. **Decouple Bull workers.** Spin them into a separate Railway service for horizontal scale and isolation from HTTP load.
3. **Add monitoring** — p50/p95 latencies, webhook replay rate, queue depth, DB slow-query log.
4. **Unify filter + KPI logic** — already mostly canonical (`filterBuilder` + `kpiCalculator`); enforce by linting against direct Prisma queries on `Order` outside these helpers.
5. **Tests on the hot path** — unit tests on `buildOrderWhereClause`, `kpiCalculator.computeKPIs`, `events.ingestEvent`, `mapping.cache.mapWording`. High leverage; small surface.

The codebase is **well-organized by domain**, uses **canonical functions as single sources of truth** (`kpiCalculator`, `filterBuilder`, `events.ingestEvent`, `mapping.cache`), and has **robust audit trails** (`OrderLog`, `ShipmentEvent`, `WebhookEventLog`). Refactors should preserve these guardrails.
