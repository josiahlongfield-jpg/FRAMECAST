import { BRAND } from "@/lib/brand";
import { RETENTION_DAYS } from "@/lib/retention";

/**
 * Who runs the service, for the terms, privacy policy and data processing
 * agreement. Set the postal address once there is one; the pages leave it
 * out while it's null.
 */
export const LEGAL = {
  product: BRAND.name,
  operator: "Josiah Longfield",
  abn: "38 364 192 034" as string | null,
  postalAddress: null as string | null,
  email: "support@sureframe.app",
  website: "sureframe.app",
  state: "Queensland",
  country: "Australia",
  minimumAge: 18,
  retentionDays: RETENTION_DAYS,
  /** A removed client is kept this long, so the business can restore them, then deleted. */
  removedClientDays: 30,
  /** A deleted or closed account is kept this long, then permanently deleted. */
  deletionGraceDays: 30,
  /** Records of support actions on accounts are kept this long. */
  supportRecordYears: 7,
  /** Time to ask us to review a suspension, closure or turned-off link. */
  reviewDays: 30,
  dpaVersion: "1.0",
  updated: "10 October 2026",
};

export const operatorLine = () =>
  `${LEGAL.product} is operated by ${LEGAL.operator}, a sole trader based in ${LEGAL.state}, ${LEGAL.country}${LEGAL.abn ? ` (ABN ${LEGAL.abn})` : ""}`;

/** Where Neon and the Cloudflare R2 bucket keep data. Null until confirmed: the pages then give no location. */
export const NEON_LOCATION: string | null = null;
export const R2_LOCATION: string | null = null;

export type Subprocessor = {
  name: string;
  /** What we use them for, shown in brackets after the name. */
  purpose: string;
  /** The personal information they handle. */
  data: string;
  /** Where they store or process it, as a country or region. Null leaves it out. */
  location: string | null;
  /** Handles personal information we process for businesses, so it's listed in the DPA's Annex 3. */
  customerData: boolean;
};

/**
 * Service providers that handle personal information for us. The privacy
 * policy lists them all; the DPA lists those with `customerData`. Stripe,
 * Link and Google sign-in aren't here: they're separate controllers.
 */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Vercel",
    purpose: "hosting the website and app",
    data: "everything sent to or from the website and app passes through it, and it keeps request logs, including IP addresses",
    location: "United States",
    customerData: true,
  },
  {
    name: "Neon",
    purpose: "our database",
    data: "account, team, client, billing and support details, details of videos we can read (such as titles), and the encrypted text of replies, to-dos, notes, transcripts and summaries",
    location: NEON_LOCATION,
    customerData: true,
  },
  {
    name: "Cloudflare R2",
    purpose: "file storage",
    data: "encrypted video and voice recordings",
    location: R2_LOCATION,
    customerData: true,
  },
  {
    name: "Resend",
    purpose: "email delivery",
    data: "names, email addresses and the emails we send, such as sign-in links, client links, reminders and team emails",
    location: "United States",
    customerData: true,
  },
  {
    name: "Anthropic",
    purpose: "the help chat’s AI assistant, and AI summaries for businesses that switch them on",
    data: "help chat messages, and transcript text when a business uses AI summaries",
    location: "United States",
    customerData: true,
  },
  {
    name: "Google Workspace",
    purpose: "our support email",
    data: "emails to and from our support inbox, including help chats passed to a person",
    location: "United States",
    customerData: true,
  },
];

/** When the sub-processor list last changed. Follows the pages' date until the list changes on its own. */
export const SUBPROCESSORS_UPDATED: string = LEGAL.updated;
