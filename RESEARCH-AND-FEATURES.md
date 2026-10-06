# Loom complaints and feature recommendations

Researched 2026-10-06 from public reviews (Capterra, review roundups) and Loom's own support pages. Sources at the bottom.

## 1. What Loom users complain about most

| # | Complaint | What reviewers say | How often |
|---|---|---|---|
| 1 | **Recordings crash or fail to upload** | "it does crash sometimes", "record button needs clicking multiple times", "performance is so poor I have to restart my recording". Loom's own help pages tell users to dig temporary video parts out of a hidden folder, zip them and email support when an upload fails. If that folder is empty, the video is gone. | Top technical complaint |
| 2 | **Price jumps since the Atlassian takeover** | "price is nearly doubling for my small business", bills going from $18/mo to $220/mo, one workspace from $240/yr to $24,000/yr after dormant free users were turned into paid seats. | Very frequent, recent |
| 3 | **Free plan runs out fast** | 25 videos at 5 minutes each, 720p. Active users hit the cap in about a week. | Very frequent |
| 4 | **Weak editing** | "can't add images, graphics, text to finished videos", "better not to offer an editor than one this poor". | Frequent |
| 5 | **Pushy upselling** | "aggressive when it comes to pushing premium features". | Moderate |
| 6 | **Videos are public by default** | New recordings default to anyone-with-the-link, risky for client or health information. | Moderate |
| 7 | **Messy library** | "difficult to quickly find a specific video" once a workspace grows. | Light |
| 8 | **Audio out of sync, login problems after the migration** | Reported alongside upload failures. | Light |
| 9 | **Lock-in** | Years of Loom links embedded in docs makes switching hard. | Light |

## 2. How Framecast answers each one

| Complaint | Answer | Status |
|---|---|---|
| Crashes / lost uploads | Uploads during recording, local backup, automatic recovery on next open. No support ticket, no zip files. | **Built and tested** |
| Price shock | Clients and viewers are always free and are never turned into paid seats. Only people who record *for a business* pay. Price lock for founding customers. | Pricing rule to adopt |
| Free plan too small | Keep the free tier generous enough for a real trial, for example 25 videos at 10 minutes and 1080p. | Config change |
| Weak editing | Trim, cut, text overlays and drawing on the video (see 3.4). | To build |
| Upselling | One upgrade prompt only when a limit is actually reached. | Policy |
| Public by default | **Private by default**: only the people a video is sent to can watch it. | To build |
| Messy library | One folder per client, search by title and transcript. | To build |
| Audio sync | Audio re-synced during processing (Mux). | Built, needs Mux keys |
| Lock-in | One-click export of every video and transcript. | To build |

## 3. Features for the personal-trainer check-in use case (and businesses like it)

The pattern: one coach, many clients, a back-and-forth conversation about each client's progress, often filmed on a phone in a gym.

1. **Video, voice or text replies on every video.** The client opens the link and replies with a video from their phone, a voice note, or a typed message, with no account and no app download. The coach replies back the same way. Each client's messages form one conversation thread. *This is the core of the pitch.*
2. **Client spaces.** Each client gets a private space holding their whole history of check-ins and replies, so the coach can see progress over months. Private by default.
3. **Check-in requests and reminders.** The coach sets "Weekly check-in, every Sunday". The client gets a text or email with a one-tap link to record and send. The coach sees who has and hasn't checked in.
4. **Form-review tools.** Slow motion, frame-by-frame stepping, side-by-side comparison of two videos (week 1 vs week 8), and drawing lines or circles on a paused frame with a voice-over. This is where Loom is weakest and where coaches get the most value.
5. **Rear camera at full quality.** Record in 1080p or 4K at 60 fps for movement. Uploads safely over gym Wi-Fi or cellular, and waits for Wi-Fi if the client chooses.
6. **Notifications.** Push and email when a client watches, replies or misses a check-in.
7. **Branding.** The coach's or company's logo and colours on share pages and emails, so it looks like their own product to their clients.
8. **Captions and transcripts.** Automatic captions, plus a searchable transcript of every check-in.
9. **Templates and saved replies.** Reusable intro videos and text replies for common feedback.
10. **Export.** Download any client's full history.

## 4. Recommended build order

1. Video, voice and text replies with conversation threads (feature 1) plus private-by-default links.
2. Client spaces and check-in requests with reminders (features 2 and 3).
3. Form-review tools (feature 4) and branding (feature 7).
4. Notifications, captions, templates, export.

## Sources
- [Capterra: Loom reviews](https://www.capterra.com/p/191187/Loom/reviews/)
- [Trainn: Loom reviews roundup (Sep 2026)](https://trainn.co/blog/loom-reviews/)
- [Prospeo: Loom pricing, reviews, pros and cons (2026)](https://prospeo.io/s/loom-pricing-reviews-pros-and-cons)
- [Atlassian support: find video parts when an upload fails (Mac)](https://support.atlassian.com/loom/kb/find-the-video-parts-stored-on-your-computer-when-an-upload-fails-mac-app/)
- [Atlassian support: recover stuck desktop recordings](https://support.atlassian.com/loom/kb/how-to-recover-stuck-desktop-app-recordings-by-using-auto-recovery/)
- [Atlassian support: Loom pricing and billing changes after integration](https://support.atlassian.com/loom/docs/loom-customer-integration-with-atlassian-pricing-billing-and-role-changes/)
