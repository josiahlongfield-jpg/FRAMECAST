import { BRAND } from "@/lib/brand";
import { RETENTION_DAYS } from "@/lib/retention";

/**
 * Who runs the service, for the terms and privacy policy. Set the postal
 * address once there is one; the pages leave it out while it's null.
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
  updated: "9 October 2026",
};

export const operatorLine = () =>
  `${LEGAL.product} is operated by ${LEGAL.operator}, a sole trader based in ${LEGAL.state}, ${LEGAL.country}${LEGAL.abn ? ` (ABN ${LEGAL.abn})` : ""}`;
