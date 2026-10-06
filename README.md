# Framecast

Async screen and camera recording for teams, built to never lose a take.
"Framecast" is a placeholder name; rename it in `apps/web/src/lib/brand.ts` and `apps/mobile/app.json`.

See [PLAN.md](PLAN.md) for product scope, pricing and architecture.

| Path | What |
|---|---|
| `apps/web` | Next.js 15 web app + API (recorder, share pages, library, Stripe billing) |
| `apps/mobile` | Expo SDK 57 app for iOS and Android (record, library, share) |

## Run the web app locally

```bash
docker compose up -d                 # Postgres
cd apps/web
cp .env.example .env                 # then set AUTH_SECRET (npx auth secret)
npm install
npx prisma migrate dev
npm run dev                          # http://localhost:3000
```

With no S3 or Mux keys, uploads are stored on local disk and played back directly. That is enough to demo the full record → share flow.

## Run the mobile app

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000 npx expo run:ios   # or run:android
```

The camera and secure storage need a development build (`expo run:*` or `eas build --profile development`), not Expo Go.

## How recordings stay safe

1. The browser recorder emits a chunk every 2 seconds and writes it to IndexedDB **before** uploading it.
2. Chunks are grouped into 5 MiB parts and uploaded in order with retries (`PUT /api/videos/:id/parts/:n`). Parts are idempotent, so a resend after a crash is harmless.
3. A chunk is deleted locally only after the server confirms the part that contains it.
4. On the next visit to the recorder, anything left over is uploaded and the video is finished automatically.
5. On mobile, the finished file is moved to the app's documents folder with a manifest and uploaded the same way; uploads resume on next launch.

## Tests

`apps/web/e2e/record.mjs` drives Chromium with a fake camera through sign in, recording, playback, commenting, and a crash mid-recording followed by recovery.
`apps/web/e2e/multipart.mjs` checks the upload protocol (out-of-order parts, retries, missing-part rejection, byte-exact assembly, range requests, auth).

```bash
cd apps/web && npm run build && npm start &
node e2e/record.mjs /tmp && node e2e/multipart.mjs
```

## Going to production

- Host `apps/web` on Vercel; Postgres on Neon or Supabase; storage on Cloudflare R2 (set `S3_*`).
- Create a Mux account and point its webhook at `/api/webhooks/mux`.
- Create Stripe products for Pro and Business (per-seat monthly prices) and point a webhook at `/api/webhooks/stripe` for `customer.subscription.*` events.
- Ship mobile with `eas build` and `eas submit`. Paid upgrades in the iOS and Android apps must follow App Store and Play billing rules (RevenueCat recommended).
