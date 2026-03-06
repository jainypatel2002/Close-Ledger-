# Nightly Closing (Next.js + Supabase, Offline-First)

Production-ready multi-store nightly closing app with strict `ADMIN` / `STAFF` RBAC, Supabase RLS, offline persistence + sync, chart dashboard, and PDF generation/storage.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + Framer Motion (3D cards/buttons)
- Supabase (Postgres + Auth + Storage)
- Zod + React Hook Form
- Dexie (IndexedDB offline mirror + mutation queue)
- Zustand (sync/network state)
- Recharts (dashboard charts)
- `pdf-lib` (server PDF + offline fallback)
- Vitest + Playwright

## 1) Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill env values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (usually `http://localhost:3000`)

4. Apply SQL migrations in Supabase SQL editor (in order):

- Run [`supabase/migrations/202603060001_nightly_closing.sql`](/Users/jainypatel/Desktop/Close Ledger /supabase/migrations/202603060001_nightly_closing.sql)
- Run [`supabase/migrations/202603060002_lottery_master_monthly_reports.sql`](/Users/jainypatel/Desktop/Close Ledger /supabase/migrations/202603060002_lottery_master_monthly_reports.sql)
- Optional sample data: [`supabase/seed.sql`](/Users/jainypatel/Desktop/Close Ledger /supabase/seed.sql)

5. Start app:

```bash
npm run dev
```

## 2) Supabase project + storage bucket

1. Create a Supabase project.
2. Enable Email/Password auth.
3. Run both migration SQL files above in order.
4. Ensure Storage bucket `closing-pdfs` exists:
   - Migration creates it with object policies.
5. Create first account in app (`/login`), then create first store in `/setup`.

## 3) Deployment (Vercel recommended)

1. Push repo to GitHub.
2. Import in Vercel.
3. Configure same environment variables.
4. Deploy.
5. Confirm Supabase URL and auth callback domains are configured for production hostname.

## 4) Role model summary

- `ADMIN`
  - Full CRUD on stores, members, closings, historical edits, PDF re-generation, exports, audit access.
- `STAFF`
  - Can create/save `DRAFT` closings only.
  - Can edit only own current-day draft before submit/finalize.
  - Can submit/finalize own draft.
  - Cannot edit once submitted/finalized/locked.
  - Cannot delete, manage settings/team, or override admin-restricted areas.

Server enforcement:
- Supabase RLS policies + helper functions.
- Closing update trigger blocks post-draft staff edits.
- API routes perform role checks and return readable permission errors.

Admin UI:
- `/stores` for multi-store create/switch
- `/team` for role + permissions
- `/settings` for store defaults and staff toggles
- `/audit` for change history

## 5) Offline sync (how it works)

1. Form edits are cached in IndexedDB (`Dexie`).
2. Save actions enqueue mutations in `mutations` queue.
3. When online (or manual `Sync now`), queue is replayed through `/api/sync`.
4. Server validates with the same RBAC rules + RLS.
5. Unauthorized mutations remain in queue as `FAILED` with message:
   - `"This record is locked or you do not have permission to edit it."`

### Offline PDF behavior

- If server PDF generation is unavailable/offline:
  - Client generates local PDF fallback.
  - Local file downloads immediately.
  - Upload mutation is queued for `closing-pdfs` bucket once online.

## 6) Troubleshooting sync

- If queue keeps failing:
  - Open dashboard and inspect sync badge.
  - Ensure internet is available and user still has store membership.
  - For staff failures on old entries, ask admin to reopen/edit.
- If PDFs fail to upload:
  - Verify storage bucket policies and `closing_documents` RLS.
  - Trigger `Sync now` after reconnecting.

## 7) Build/dev stability

- This project currently runs Next.js with explicit Webpack mode for stable local and production builds:
  - `npm run dev` -> `next dev --webpack`
  - `npm run build` -> `next build --webpack`
- If you hit stale cache behavior, run:

```bash
rm -rf .next
npm install
npm run dev
npm run build
```

## 8) Test commands

```bash
npm run test
npm run test:e2e
```

Included test coverage:
- Closing math logic.
- RBAC/edit lock behavior.
- Offline lock rejection messaging.
- E2E smoke redirect to login for unauthenticated access.
