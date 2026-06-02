# DentalOS — Claude Code Project Guide

## What this is
A multi-clinic dental ERP for 10 clinics across 5 legal entities (Malaysia).
Built with Next.js 14 App Router, Prisma ORM, PostgreSQL, TypeScript.

## Key business rules (READ BEFORE CODING)
- Commission formula: `(TreatmentAmount - LabFee) × DoctorSplit × DoctorRate`
- Staff commission: collected cash from treatments ONLY (no products)
- Staff commission is pro-rated: `GrossComm × (AttendedDays / TotalWorkingDays)`
- Forfeit rule: EL + MC + Unpaid + Late > 5 combined = zero commission (configurable per clinic)
- Time slip: partial-day = 0.5 day deduction (reviewed by Finance Manager)
- Annual Leave counts as a full attended day
- Locum floor: MAX(commission, sessions × dayRate)
- Lab fees: NEVER shown on patient invoice; visible in commission listing only
- All commission rates and tiers are configurable per clinic (nothing hardcoded)
- 5 companies, 10 clinics — every table has clinic_id and entity_id
- SST 6% applies to foreign patients at SST-registered clinics
- Panel billing: separate column per panel provider in daily ledger

## Stack
- Framework: Next.js 14 (App Router)
- Database: PostgreSQL via Prisma
- Auth: NextAuth.js with RBAC middleware
- UI: Tailwind CSS + shadcn/ui
- Email: Resend (commission slips)
- File export: xlsx + pdfmake

## Roles (enforce in middleware)
super_admin, clinic_manager, doctor, nurse, receptionist, storekeeper, finance

## Run locally
```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, NEXTAUTH_SECRET
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Key commands for Claude Code
- `npx prisma studio` — browse DB visually
- `npm run test` — run Jest tests
- `npm run commission:run -- --month=2026-05 --clinic=clinic-a` — run commission calculation
- `npm run ledger:export -- --clinic=clinic-a --month=2026-05` — export daily ledger CSV
