# DentalOS — Deploying to Vercel + Neon

This guide walks you through getting DentalOS live on the internet using **Neon** (free PostgreSQL cloud database) and **Vercel** (free hosting for Next.js apps).

---

## Before You Start — Things to Know

- Your code is already in a GitHub repo: `sinteng98wong-cmd/my-website`
- The app needs 5 environment variables to run
- The whole process takes about 20–30 minutes

---

## Step 1 — Set Up a Neon PostgreSQL Database

1. Go to [neon.tech](https://neon.tech) and sign up for a free account (use your Google or GitHub login for speed).

2. Click **"New Project"**, give it a name like `dental-erp`, and choose the **Singapore** region (closest to Malaysia).

3. Once created, click on your project → go to **"Connection Details"** in the left sidebar.

4. Find the **Connection string** — it looks like:
   ```
   postgresql://username:password@ep-xxxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Copy this. You'll need it shortly.

> **Important:** Neon requires `?sslmode=require` at the end of the URL. Make sure it's there.

---

## Step 2 — Make One Code Change (Prisma + Neon Connection Pooling)

Neon works best with Prisma when you enable **connection pooling**. Without this, you'll get "too many connections" errors on Vercel (which runs many parallel serverless functions).

Open `prisma/schema.prisma` and update the `datasource` block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Then in your `.env` file (and later in Vercel), you'll need **two** database URLs:
- `DATABASE_URL` — the **pooled** connection string from Neon (append `?pgbouncer=true` if Neon provides a pooler URL)
- `DIRECT_URL` — the **direct** connection string (used by Prisma migrations)

In Neon's dashboard, under **Connection Details**, switch the dropdown from **"Pooled connection"** to **"Direct connection"** to get both URLs.

> If Neon only shows one URL (no pooler option on the free plan), just set both `DATABASE_URL` and `DIRECT_URL` to the same string. It will still work — you just won't get pooling benefits.

Commit this schema change:
```bash
git add prisma/schema.prisma
git commit -m "add directUrl for Neon connection pooling"
git push
```

---

## Step 3 — Push Code to GitHub (if not already up to date)

Your repo is already connected to GitHub at `sinteng98wong-cmd/my-website`. Make sure your latest code is pushed:

```bash
git add -A
git commit -m "ready for deployment"
git push origin main
```

---

## Step 4 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up / log in with your **GitHub account**.

2. Click **"Add New Project"** → find and select your `my-website` repository.

3. Vercel will detect it's a Next.js project automatically. Don't change the build settings — they're correct.

4. **Before clicking Deploy**, expand the **"Environment Variables"** section and add all 5 variables below:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon pooled connection string |
| `DIRECT_URL` | Your Neon direct connection string (or same as above) |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` (you'll get this URL after first deploy — update it then) |
| `NEXTAUTH_SECRET` | A random secret — generate one at [generate-secret.vercel.app](https://generate-secret.vercel.app/32) |
| `RESEND_API_KEY` | Get a free key at [resend.com](https://resend.com) (needed for commission emails — leave blank `""` if not using email yet) |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (same as NEXTAUTH_URL) |

5. Click **"Deploy"**. Vercel will build the app — this takes 2–3 minutes.

---

## Step 5 — Run Database Migrations on Neon

Your Neon database is empty — you need to push the Prisma schema to it.

On your **local machine**, temporarily set `DATABASE_URL` in your `.env` to the Neon direct URL, then run:

```bash
npx prisma migrate deploy
```

This applies all your migration files to the Neon database.

Then seed the database with initial data:

```bash
npx prisma db seed
```

> If you don't have a `.env` locally with the Neon URL, you can pass it inline:
> ```bash
> DATABASE_URL="postgresql://..." npx prisma migrate deploy
> ```

---

## Step 6 — Fix NEXTAUTH_URL After First Deploy

After Vercel gives you your live URL (e.g. `https://my-website-abc123.vercel.app`):

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to your actual URL
3. Go to **Deployments** → click the three dots on your latest deploy → **"Redeploy"**

---

## Step 7 — Set Up a Custom Domain (Optional)

If you want a proper URL like `dentalos.yourdomain.com`:

1. In Vercel: **Settings** → **Domains** → add your domain
2. Follow Vercel's DNS instructions (add a CNAME or A record at your domain registrar)
3. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the custom domain and redeploy

---

## ⚠️ Issues to Fix Before Deployment

### 1. NEXTAUTH_SECRET is exposed in `.env.example`
Your `.env.example` contains a real secret value (`JEOWIAU82O3U2OH2T`). This is now visible in GitHub. You should:
- Generate a new secret for production (use [generate-secret.vercel.app](https://generate-secret.vercel.app/32))
- Replace the `.env.example` value with a placeholder like `your-random-secret-here`

### 2. DATABASE_URL in `.env.example` contains a real password
The example shows `postgresql://Wong@123@localhost:5432/dental_erp`. Replace with a placeholder — real credentials shouldn't be in version-controlled files.

### 3. `next.config.js` uses `serverComponentsExternalPackages`
In Next.js 14.2+, this option was moved. Change `next.config.js` from:
```js
experimental: {
  serverComponentsExternalPackages: ["@prisma/client"],
}
```
to:
```js
serverExternalPackages: ["@prisma/client"],
```
(outside the `experimental` block). This prevents a build warning that may become an error in future Next.js versions.

### 4. The `xlsx` package has a known security advisory
The `xlsx` package (v0.18.5) you're using is unmaintained and has vulnerabilities. It works for now, but consider migrating to `exceljs` when you have time.

### 5. Resend API key is empty
If `RESEND_API_KEY` is blank, commission email sending will silently fail. This won't break the app, but set it up before going live with commission features.

---

## Scheduled Jobs (Cron)

`vercel.json` declares the scheduled jobs, including the nightly stock ledger
drift check (`/api/cron/stock-drift`, 18:00 UTC = 02:00 Malaysia time).

**Required for any of them to run:**

1. **`CRON_SECRET` must be set as a Vercel environment variable.** Every cron
   route rejects an unauthenticated call with 401. If the variable is unset,
   the schedule fires but every run is refused and nothing is recorded.
   Vercel also only *sends* its `Authorization: Bearer` header when this
   variable exists, so without it the job cannot authenticate by any route.
2. **The plan must allow seven cron jobs.** `vercel.json` declares seven.
   Vercel Hobby permits **2 cron jobs, once per day**; Pro permits 40 at any
   frequency. On Hobby the extra jobs are silently not registered — the
   deployment succeeds and the job simply never fires. **Verify the count in
   the Vercel dashboard under Settings → Cron Jobs after deploying: all seven
   must be listed, including `/api/cron/stock-drift`.**
3. **`RESEND_API_KEY` must be set** for drift alerts to reach administrators.
   Without it the check still runs and records its result, but nobody is
   emailed — the failure is only visible on the Ledger Drift page.
4. **Timeout.** `/api/cron/stock-drift` sets `maxDuration = 60`. A platform
   default of 10-15s would abort the scan as the ledger grows, and an aborted
   run writes no record — a silent miss.

### Header convention — check this before relying on the schedule

Vercel Cron authenticates by sending `Authorization: Bearer $CRON_SECRET`.
The six pre-existing cron routes in this repo only check a custom
`x-cron-secret` header, which Vercel does **not** send. If those jobs are
currently being invoked by Vercel Cron, they are being rejected.

`/api/cron/stock-drift` accepts **both** headers, so it works either way. If
the other jobs are silently failing, they need the same treatment — check the
Vercel deployment logs for 401s on the cron paths.

**Unrelated finding, not fixed here:** `/api/cron/leave-digest` checks no
secret at all. It is publicly callable and sends email to clinic managers on
each call. It is outside the stock work, so it was left alone deliberately —
but it should be given the same guard as the other five.

### Confirming the first nightly run

The Ledger Drift page (**Inventory → Ledger Drift**) warns when the schedule
has never run, or has not run for more than 36 hours. A green "Ledger
reconciles" result on that page is an *on-demand* check and says nothing about
whether the schedule is working — the amber banner is the signal to watch.

To confirm without waiting for the night:

```bash
curl -i -H "x-cron-secret: $CRON_SECRET" https://<your-app>/api/cron/stock-drift
```

A 200 with `{"status":"SUCCESS", ...}` means it works end to end. A 401 means
`CRON_SECRET` does not match. After the first real firing, the run appears in
the page's "Scheduled run history" with trigger `CRON`.

### Running the check without a scheduler

If the deployment cannot run scheduled jobs, run it from any machine with
database access:

```bash
npx tsx scripts/stock-drift-check.ts --record   # records an audit row
npx tsx scripts/stock-drift-check.ts            # ad-hoc, prints only
```

Wire that into an external scheduler (GitHub Actions on a schedule, a server
crontab, or a monitoring service hitting the endpoint with the secret header).

---

## Summary of All Environment Variables for Vercel

```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=<generate a 32-char random string>
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
RESEND_API_KEY=re_xxxxxxxxxxxx
CRON_SECRET=<generate a 32-char random string — required for all scheduled jobs>
```

---

## Quick Checklist

- [ ] Created Neon project and copied connection string
- [ ] Updated `prisma/schema.prisma` to add `directUrl`
- [ ] Fixed `next.config.js` (`serverExternalPackages`)
- [ ] Replaced real credentials in `.env.example` with placeholders
- [ ] Pushed all changes to GitHub
- [ ] Created Vercel project and set all 7 env vars (including `CRON_SECRET`)
- [ ] Ran `npx prisma migrate deploy` against Neon
- [ ] Ran `npx prisma db seed` to populate initial data
- [ ] Updated `NEXTAUTH_URL` to real Vercel URL and redeployed
- [ ] Tested login at the live URL
- [ ] Confirmed the nightly drift check runs (Inventory → Ledger Drift shows a run)
