import { BRAND } from "@/lib/brand";
import { RETENTION_DAYS } from "@/lib/retention";

/**
 * Who runs the service, for the terms and privacy policy. Fill in the ABN and
 * postal address once they exist; the pages show "pending" until then.
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
  updated: "8 October 2026",
};

export const operatorLine = () =>
  `${LEGAL.product} is operated by ${LEGAL.operator}, a sole trader based in ${LEGAL.state}, ${LEGAL.country}${LEGAL.abn ? ` (ABN ${LEGAL.abn})` : ""}`;
