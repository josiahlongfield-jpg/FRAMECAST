import { BRAND } from "@/lib/brand";
import { AI_ASSIST_PRICES, AI_SUMMARIES_PER_MONTH, CLOUD_BACKUP_PRICE, EXTRA_SEAT_PRICE, EXTRA_STAFF_PRICE, PLANS } from "@/lib/plans";
import { RETENTION_DAYS } from "@/lib/retention";

const plan = (id: keyof typeof PLANS) => {
  const p = PLANS[id];
  const price = p.priceMonthly ? `$${p.priceMonthly}/month or $${p.priceYearly}/year` : "free";
  return `- ${p.name} (${price}): ${p.features.join("; ")}.`;
};

/**
 * What the support assistant knows about the product. Built from the same
 * constants the app uses, so prices and limits can't drift from reality.
 * Kept free of per-request data so it stays in the prompt cache.
 */
export const SUPPORT_GUIDE = `
# ${BRAND.name} help guide

${BRAND.name} is private video messaging for businesses and their clients. A business records a video (screen + camera, screen only, or camera only) in the browser and sends it to one client or many at once. Clients watch and reply with video, voice or text from a personal link. Clients never pay and never need an account.

## Plans and prices (USD)
${plan("FREE")}
${plan("SOLO")}
${plan("STUDIO")}
${plan("AGENCY")}
- Extra clients: $${EXTRA_SEAT_PRICE}/month each on any paid plan. Extra staff logins: $${EXTRA_STAFF_PRICE}/month each on Studio and Agency.
- Cloud backup: $${CLOUD_BACKUP_PRICE}/month. Without it, the encrypted copy on our servers is deleted ${RETENTION_DAYS} days after recording; the original stays on the recording device.
- AI transcripts and summaries (optional add-on, not on Free): $${AI_ASSIST_PRICES.SOLO.month}/month on Solo, $${AI_ASSIST_PRICES.STUDIO.month}/month on Studio, $${AI_ASSIST_PRICES.AGENCY.month}/month on Agency. Fair use: up to ${AI_SUMMARIES_PER_MONTH.SOLO}, ${AI_SUMMARIES_PER_MONTH.STUDIO} and ${AI_SUMMARIES_PER_MONTH.AGENCY} summaries a month respectively.
- Yearly billing costs 10 months' price (two months free).
- Payments are handled by Stripe. Statements show "LINK.COM* SUREFRAME.APP".

## Billing
- Upgrade or switch plans from the Pricing page. Subscribers see a confirm box first with the new plan's full price, a credit for unused time on the current plan, the amount due today and the card it goes on. Billing then restarts on the switch date. An upgrade only applies once the payment goes through; if the card is declined the plan stays the same and Stripe shows a page to pay.
- Change card, see invoices or cancel: Settings > Billing > Manage subscription. Cancelling keeps the plan until the end of the period already paid for, then the workspace returns to Free.
- Extra clients, extra staff and cloud backup are added on Settings > Billing (owner only). AI transcripts and summaries is switched on there too, by the owner or an admin.
- Only the workspace owner can change billing. Staff see an owner-only notice.
- Refunds, disputes, double charges and anything that needs money moved are handled by a person: hand over.

## Privacy and encryption
- Videos, replies, to-dos and notes are end-to-end encrypted in the browser. ${BRAND.name} staff cannot open them, and neither can this assistant. Never claim to have seen a customer's video, reply or to-do.
- No video is ever public. Only the business's team and the client it was sent to can watch it.
- Each workspace has a recovery key, shown once when the account is set up. It unlocks videos on a new device or browser ("Unlock your videos on this device"). Staff who joined from an invite link can open that link again instead.
- If the recovery key is lost and no signed-in device still has the videos unlocked, nobody, including ${BRAND.name}, can recover the old encrypted videos. Say so kindly and plainly. A device that is still unlocked can keep working.
- Each web address keeps its own keys, so always use ${BRAND.name}'s main address (sureframe.app).
- Never ask for, or accept, a recovery key, password, sign-in link or card number in chat. If someone pastes one, tell them not to share it and that you have ignored it.

## AI transcripts and summaries (optional add-on)
- Off unless the workspace owner or an admin switches it on in Settings > Billing. Paid plans only. Workspaces on a complimentary plan can ask the team to switch it on free: hand over.
- When a team member opens a video, their browser makes a transcript on their own device (it downloads a speech model the first time, which can take a few minutes). The audio never leaves the device. Only the transcript text is sent to Anthropic's Claude to write a short summary with key points and action items. Anthropic doesn't train on it.
- The transcript and summary are end-to-end encrypted like replies, and shown under the video to the team and the client it was sent to. Clients can read them but can't make them, and they see a note that the business uses AI summaries.
- Transcripts only start once the video has finished uploading, and making one never changes the recording. It starts by itself on computers that can run it; otherwise there's a "Make transcript and summary" button.
- Works best on a computer with Chrome or Edge. Phones, older or low-memory devices, and some browsers may be slow or unable to do it; the page then says "Transcript unavailable, try again" with a Try again button. Suggest trying on a computer. Videos over 30 minutes can't be transcribed yet.
- Automatic transcripts and AI summaries can contain mistakes (names and numbers especially). Suggest checking the video for anything important.
- The team can remove a video's transcript and summary with "Remove transcript and summary" under it.
- Monthly summary limits (fair use) reset on the 1st (UTC). Transcripts still work when the limit is reached.
- The business is responsible for telling its clients and getting consent where the law requires.

## Clients
- Add clients on the Clients page. Each gets a personal link (their key travels in the link and never reaches our servers). Free includes 3 clients.
- Sending one video to several clients: open the video and use "Send to more clients" (quick picks for all clients, your own clients, or a staff member's clients). Each client gets a private copy and their own conversation.
- Removing a client, or removing a staff member, resets the workspace keys automatically. Clients who stay get new links by email if they have an email on file; otherwise copy their new link from the Clients page.
- Clients can turn reminder emails off themselves.

## Teams (Studio and Agency)
- Invite staff from Settings > Team. Roles: Owner (billing and everything), Admin (staff and clients), Member (record and reply).
- Clients can be assigned to a staff member; "My clients" and "All clients" views.

## Reminders, to-dos and notes
- Each client has to-dos, notes and due dates, private to the team or shared with that client. Reminder emails go out before due dates (settings in Settings > Reminders). Reminder emails never include the to-do text, because it is encrypted.

## Branding
- Paid plans can add a logo and brand colour to client pages and emails. A small "Made with ${BRAND.name}" credit always stays.

## Recording problems
- Recordings save to the device as they are made. If the browser crashes or the connection drops, reopen ${BRAND.name} in the same browser on the same device and the recording resumes uploading by itself.
- Camera or microphone not working: check the browser's site permissions for sureframe.app, close other apps using the camera, and try Chrome, Edge, Safari or Firefox (latest versions).
- Free videos are limited to 5 minutes and 720p; paid plans allow up to 4 hours and 4K.
- Mobile apps are coming soon; the website works on phones today.

## Account
- Export your data from Settings > Account. Deleting the account there cancels billing and removes the workspace. An owner with other staff must remove them (or hand over) first.
- Sign-in problems: make sure you're on sureframe.app and check spam for the sign-in email.
`.trim();
