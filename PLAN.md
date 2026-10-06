# SureFrame: Product & Architecture Plan

> Product name: SureFrame (chosen 2026-10-06; previously the placeholder "Framecast").

## 1. Positioning

Async video messaging for teams (record screen + camera, share a link, get viewed/commented) that **never loses a recording** and works the same on web, iOS and Android.

Target market: a broad range of businesses that work with clients, customers, students or patients. A personal trainer doing client check-ins is the first example, not a niche focus. The business and client trade videos back and forth, and either can reply with video, voice or text. See [RESEARCH-AND-FEATURES.md](RESEARCH-AND-FEATURES.md) for the review research and the feature list built on it.

Pitch line for businesses: *"Loom, but it doesn't crash, it doesn't lose your take, and it's priced per active creator, not per seat you forgot to remove."*

## 2. Loom's known pain points → our answer

| Pain point (commonly reported) | SureFrame answer |
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
| Free | $0 | 25 videos, 5 min each, 720p, 3 client accounts |
| Pro | $12 / creator / mo | Unlimited videos, 4h length, 1080p/4K, editing, branding, 10 client accounts |
| Business | $20 / creator / mo | Pro + SSO, analytics, retention, admin controls, priority support, 25 client accounts |
| Extra client seats | $2 / seat / mo | Paid plans only |
| Cloud backup | $5 / workspace / mo | Optional; keeps encrypted copies past the 30-day relay window |

**Clients never pay.** A client account can watch and reply (video, voice, text) to what's sent to them, but can't create videos. Seats are capped per plan so the free side can't be abused; creators buy more as needed.

**Private by default.** No public videos. A video is visible only to the creator's team and the one client it is sent to, through that client's personal link. Removing a client cuts off access immediately.

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

## 6. Privacy: encrypted relay (chosen 2026-10-06)
- Every recording and reply is **end-to-end encrypted on the device** (AES-256-GCM, per-chunk) before it is saved locally or uploaded. The server stores only ciphertext and wrapped keys, so we cannot watch anyone's videos.
- Keys: a team key per workspace (on the team's devices only, restorable with a recovery key shown once), a key per client (travels only in the personal link's #fragment, which browsers never send to servers), and a random key per video.
- The server keeps its encrypted copy for **30 days** (configurable), then a daily job deletes it. The original stays on the device ("Save to device" on every video). **Cloud backup** ($5/month add-on) keeps encrypted copies until deleted.
- Trade-offs: no server-side transcoding, captions or AI on video content (the server can't read it); a lost recovery key means old videos can't be opened on a new device.

## 6b. To-dos, notes and due dates (built 2026-10-06)
- Each client has a page with their videos plus a to-do and notes list. Every item is either private to the team or shared with the client.
- The team also has its own list on the Library page.
- Clients see only shared items on their inbox page and can tick off shared to-dos; they can't add, edit or delete.
- Item text is end-to-end encrypted: private items with the team key, shared items with that client's key. Due dates and done/undone are not encrypted (needed for sorting and reminders).
- Repeating to-dos: every day, weekday, week (any days), 2 weeks, month, or custom, with an optional end date. The next one appears when the current one is ticked off or its time passes. All in the business's time zone, so daylight saving doesn't shift times.
- Reminder emails: any mix of 1 week, 3 days, 1 day, on the day (set time), 1 hour, at due time, or custom ("2 hours before", "3 days before at 7pm"). Sent to the client, the business, or both.
- Business controls (Reminders page): business name, time zone, reply-to email, default reminders for new to-dos, who gets them by default, and a personal message, with a live preview of the email.
- Clients can stop reminders from any email (one click, no sign-in) or from their page, and turn them back on.
- Emails never include the to-do text (it is end-to-end encrypted); they link to the client's list.
- Needs: an email provider (Resend, RESEND_API_KEY + MAIL_FROM on a verified domain) and a 5-minute cron (Vercel Pro, or any scheduler) calling /api/cron/reminders.
- Next: push notifications through the mobile app; text-message reminders (Twilio) as a paid add-on.

## 7. Open items
- Mobile app must adopt the same encryption before release (it currently uploads unencrypted and is blocked by the server).
- Video titles and client names are not encrypted (needed for lists and search); consider encrypting titles.
- Point-and-draw on a paused frame (general replacement for form review).
- S3/R2 bucket needs CORS for the browser to fetch encrypted files when using signed URLs.

## 8. App store notes
- iOS in-app subscriptions must use Apple IAP (or link out under current US rules); RevenueCat handles both stores and syncs to Stripe entitlements.
- Screen recording on iOS requires a Broadcast Upload Extension (ReplayKit); this needs a custom dev build, not Expo Go.

## 9. Delivery phases

| Phase | Scope |
|---|---|
| 0 | Repo, CI, environments, brand |
| 1 | Web MVP + billing, private beta with 3 to 5 pilot businesses |
| 2 | Mobile apps, editor, analytics, public launch |
| 3 | Enterprise features, desktop app, AI |

## 10. Decisions needed from you
1. Product name and domain.
2. GitHub repository for the code (new repo recommended).
3. Accounts to create when we wire real services: Stripe, Mux (or AWS/R2), a Postgres host, Apple Developer ($99/yr), Google Play Console ($25 one-time).
