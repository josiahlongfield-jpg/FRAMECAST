# Framecast: Product & Architecture Plan

> "Framecast" is a placeholder name. Swap it once the real brand is chosen.

## 1. Positioning

Async video messaging for teams (record screen + camera, share a link, get viewed/commented) that **never loses a recording** and works the same on web, iOS and Android.

Pitch line for businesses: *"Loom, but it doesn't crash, it doesn't lose your take, and it's priced per active creator, not per seat you forgot to remove."*

## 2. Loom's known pain points → our answer

| Pain point (commonly reported) | Framecast answer |
|---|---|
| Recordings crash / are lost mid-take, "processing" hangs | **Chunked, resumable upload while recording** (every few seconds) plus a local crash-recovery buffer (IndexedDB on web, file system on mobile). If the tab or app dies, the take is recovered on next open. |
| Long processing before a link works | Link is live the moment you stop. Viewers get the raw upload instantly; transcoded HLS replaces it in the background. |
| Heavy desktop app / extension required | Browser-native recorder first (no install). Desktop app is a later phase, not a requirement. |
| Poor mobile recording | Native mobile apps (Expo/React Native) with camera + screen recording (iOS ReplayKit, Android MediaProjection). |
| Quality drops / audio drift | Fixed bitrate ladder (up to 1080p/4K on paid tiers), separate audio track, A/V sync checked at transcode. |
| Confusing pricing / seat sprawl | Simple tiers, billed per active creator; viewers always free. |
| Enterprise concerns (privacy, retention) | Workspace-level retention, password/expiring links, SSO + audit log on Business tier. |

## 3. Feature set

**MVP (Phase 1)**
- Web recorder: screen, camera, screen + camera bubble; mic selection; pause/resume; 3-2-1 countdown
- Crash-safe chunked upload + local recovery
- Instant share link, view page with player, view count, emoji reactions, timestamped comments
- Library: list, rename, delete, folders
- Auth (email magic link + Google), workspaces, invite teammates
- Subscriptions via Stripe: Free / Pro / Business, customer portal
- Transcoding to adaptive HLS + thumbnail + auto-generated transcript/captions

**Phase 2**
- iOS + Android apps (record, library, share, notifications)
- Trim/cut editor, custom thumbnails, CTA buttons on videos
- Viewer analytics (who watched, drop-off), Slack/Teams/Gmail link unfurls
- Password-protected and expiring links, download control

**Phase 3 (enterprise)**
- SSO (SAML/OIDC), SCIM, audit log, retention policies, data region choice
- AI summaries, chapters, translated captions
- Desktop app (Electron/Tauri) for system-audio capture and hotkeys

## 4. Pricing (draft)

| Tier | Price | Limits |
|---|---|---|
| Free | $0 | 25 videos, 5 min each, 720p |
| Pro | $12 / creator / mo | Unlimited videos, 4h length, 1080p/4K, editing, branding |
| Business | $20 / creator / mo | Pro + SSO, analytics, retention, admin controls, priority support |

Annual billing at ~20% off. Viewers are always free.

## 5. Architecture

```
            ┌──────────────┐        ┌───────────────┐
 Web app ───┤  Next.js API ├────────┤ Postgres      │
 (Next.js)  │  (auth, CRUD,│        │ (Prisma)      │
 Mobile ────┤   billing)   │        └───────────────┘
 (Expo)     └──────┬───────┘
     │ presigned   │ webhooks
     │ multipart   │
     ▼             ▼
 ┌────────────────────┐   upload done   ┌──────────────────────┐
 │ Object storage     ├────────────────►│ Transcode worker     │
 │ (S3 / R2)          │◄────────────────┤ (Mux, or FFmpeg on   │
 └─────────┬──────────┘   HLS output    │  a queue)            │
           │                            └──────────────────────┘
           ▼
         CDN (CloudFront / Cloudflare) → viewers
```

**Recommended stack**
- **Web:** Next.js (App Router, TypeScript), Tailwind. Hosted on Vercel.
- **Mobile:** Expo SDK 57 (React Native) with expo-camera, and native modules for screen capture.
- **Shared:** TypeScript package for API types, plan limits, validation (zod).
- **DB:** Postgres (Neon or Supabase) via Prisma.
- **Auth:** Auth.js (NextAuth) with email + Google; SAML later via WorkOS.
- **Storage:** S3-compatible (Cloudflare R2 recommended: no egress fees, which matters a lot for video).
- **Video processing:** Mux for MVP speed (upload → HLS, thumbnails, captions in one API). Option to move to self-hosted FFmpeg workers once volume justifies it.
- **Payments:** Stripe Checkout + Customer Portal + webhooks (also RevenueCat on mobile for App Store / Play billing rules).
- **Observability:** Sentry (crash reporting on web + mobile), PostHog for product analytics.

**Reliability design (the core differentiator)**
1. MediaRecorder emits a chunk every 2s.
2. Each chunk is written to IndexedDB first, then uploaded as an S3 multipart part (min 5 MB parts, so chunks are batched).
3. Failed parts retry with exponential backoff; the upload resumes after network loss.
4. On stop, the client completes the multipart upload; the share link is already valid.
5. On next load, any unfinished session in IndexedDB is offered for recovery.

## 6. App store notes
- iOS in-app subscriptions must use Apple IAP (or link out under current US rules); RevenueCat handles both stores and syncs to Stripe entitlements.
- Screen recording on iOS requires a Broadcast Upload Extension (ReplayKit); this needs a custom dev build, not Expo Go.

## 7. Delivery phases

| Phase | Scope |
|---|---|
| 0 | Repo, CI, environments, brand |
| 1 | Web MVP + billing, private beta with 3 to 5 pilot businesses |
| 2 | Mobile apps, editor, analytics, public launch |
| 3 | Enterprise features, desktop app, AI |

## 8. Decisions needed from you
1. Product name and domain.
2. GitHub repository for the code (new repo recommended).
3. Accounts to create when we wire real services: Stripe, Mux (or AWS/R2), a Postgres host, Apple Developer ($99/yr), Google Play Console ($25 one-time).
