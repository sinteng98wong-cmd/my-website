# DentalOS

Multi-clinic dental ERP — 10 clinics, 5 entities, Malaysia.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — fill DATABASE_URL, NEXTAUTH_SECRET

# 3. Database
npx prisma migrate dev --name init
npx prisma db seed

# 4. Run
npm run dev
# → http://localhost:3000
```

## Project Structure

```
dental-erp/
├── CLAUDE.md                    ← Read this first in Claude Code
├── prisma/
│   ├── schema.prisma            ← Full DB schema (all 25 models)
│   └── seed.ts                  ← Demo data seeder
├── src/
│   ├── app/                     ← Next.js App Router
│   │   ├── (auth)/login/        ← Login page
│   │   ├── (dashboard)/         ← All protected pages
│   │   │   ├── dashboard/
│   │   │   ├── patients/        ← CRM + lab tracking
│   │   │   ├── commission/      ← Doctor + staff commission
│   │   │   ├── schedule/        ← Doctor-nurse pairing
│   │   │   ├── stock/           ← Inventory + DO
│   │   │   ├── pool-orders/     ← Pool order management
│   │   │   ├── ledger/          ← Daily/monthly ledger
│   │   │   └── settings/        ← Commission config, roles
│   │   └── api/                 ← API routes
│   │       ├── commission/
│   │       │   ├── doctor/      ← Calculate, lock, reverse
│   │       │   └── staff/       ← Calculate, lock
│   │       ├── patients/
│   │       ├── lab-jobs/
│   │       ├── invoices/
│   │       ├── stock/
│   │       ├── delivery-orders/
│   │       ├── pool-orders/
│   │       ├── ledger/
│   │       └── schedules/
│   ├── lib/
│   │   ├── commission.ts        ← Commission calculation engine
│   │   ├── rbac.ts              ← Role-based access control
│   │   ├── auth.ts              ← NextAuth config
│   │   ├── prisma.ts            ← Prisma client singleton
│   │   ├── sst.ts               ← SST calculation helpers
│   │   └── ledger.ts            ← Ledger aggregation helpers
│   ├── components/              ← Shared UI components
│   │   ├── CommissionTable/
│   │   ├── PatientCard/
│   │   ├── ScheduleGrid/
│   │   ├── StockTable/
│   │   └── LedgerGrid/
│   ├── hooks/                   ← React hooks
│   └── types/                   ← TypeScript types
├── scripts/
│   ├── commission-run.ts        ← Monthly commission batch runner
│   └── ledger-export.ts         ← CSV/Excel ledger export
└── docs/
    └── commission-rules-v1.4.docx  ← Source of truth document
```

## Key Modules

### Commission Engine (`src/lib/commission.ts`)
Pure TypeScript — no side effects, fully testable.
- `calculateDoctorCommission()` — core formula
- `applyLocumFloor()` — MAX(commission, floor)
- `checkForfeit()` — attendance forfeit logic
- `calculateAttendedDays()` — pro-ration denominator
- `calculateGrossCommission()` — progressive or flat tiers
- `calculateStaffCommission()` — full staff commission flow

### RBAC (`src/lib/rbac.ts`)
- `requirePermission(permission)` — throws if unauthorised
- `hasPermission(role, permission)` — boolean check for UI rendering

## Clinic & Entity Setup (do before first use)
1. Create 5 entities in Settings → Entities (fill SST/e-invoice flags)
2. Create 10 clinics and assign to entities (mark one as HQ)
3. Add panel providers per clinic (Settings → Panels)
4. Add commission config per clinic (Settings → Commission Config)
5. Add doctor profiles with rates (Settings → Doctor Profiles)

## Commission Lock-Off (monthly)
```bash
# Run commission calculation for a month
npm run commission:run -- --month=2026-05 --clinic=all

# After review, lock via UI → Commission → Lock-off
# System prevents edits after lock; reversals go to next month
```

## Daily Ledger Columns
All 15 columns per clinic (some configurable):
Date | Day | Patient Count | Professional Fee | Product | SST | Total Sales |
Cash (Current) | Cash (Next) | Credit Card | FPX | E-Wallet | Atome |
Panel — [per provider, clinic-specific]

## Deployment
Recommended: Vercel (frontend) + Supabase or Railway (PostgreSQL)
For on-premise: Docker Compose setup available in /docker
