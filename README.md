# Anaqatoki CRM

> Full-featured, real-time Cash-on-Delivery CRM for Moroccan e-commerce operations.

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Zustand, TanStack Table, React Router v6
- **Backend:** Fastify, TypeScript, Prisma, PostgreSQL, Redis, Socket.IO
- **Integrations:** Youcan, Coliix

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

## Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd anaqatoki-crm
npm install
```

### 2. Environment Variables

```bash
cp .env.example apps/backend/.env
cp .env.example apps/frontend/.env
# Edit each .env file with your actual values
```

### 3. Database

```bash
cd apps/backend
npx prisma migrate dev
npx prisma db seed
```

### 4. Start Development

```bash
# From root
npm run dev

# Or individually:
npm run dev:frontend   # → http://localhost:5173
npm run dev:backend    # → http://localhost:3001
```

### 5. Component Preview

```
http://localhost:5173/dev/components
```
