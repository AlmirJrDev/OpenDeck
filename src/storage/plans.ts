import type { FolderScan } from "./scan";

/** Date the prices below were read from each provider's pricing page. */
export const PRICES_CHECKED_ON = "2026-11-03";

const GB = 1024 ** 3;

export interface StoragePlan {
  id: string;
  name: string;
  source: string;
  /** Storage included for free, in GB. */
  freeGb: number;
  /** Downloads included for free each month, in GB. Infinity when downloads are free. */
  freeTransferGb: number;
  /** What happens above the free tier. */
  paid: {
    label: string;
    /** Fixed monthly fee for the paid plan, when the provider requires one. */
    baseMonthly: number | null;
    includedGb: number;
    perGbMonth: number;
    perGbDownload: number;
  };
}

export const STORAGE_PLANS: StoragePlan[] = [
  {
    freeGb: 10,
    freeTransferGb: Infinity,
    id: "r2",
    name: "Cloudflare R2",
    paid: { baseMonthly: 0, includedGb: 10, label: "Pay as you go", perGbDownload: 0, perGbMonth: 0.015 },
    source: "https://developers.cloudflare.com/r2/pricing/",
  },
  {
    freeGb: 1,
    freeTransferGb: 10,
    id: "vercel-blob",
    name: "Vercel Blob",
    // Hobby stops at its limits; going over needs the Pro plan (its fee is not included here).
    paid: { baseMonthly: null, includedGb: 0, label: "Pro plan", perGbDownload: 0.05, perGbMonth: 0.023 },
    source: "https://vercel.com/docs/vercel-blob/usage-and-pricing",
  },
  {
    freeGb: 1,
    freeTransferGb: Infinity,
    id: "supabase",
    name: "Supabase Storage",
    paid: { baseMonthly: 25, includedGb: 100, label: "Pro plan", perGbDownload: 0, perGbMonth: 0.0213 },
    source: "https://supabase.com/pricing",
  },
];

export interface PlanEstimate {
  plan: StoragePlan;
  fitsFree: boolean;
  /** Share of the free storage the library uses, 0..n. */
  freeUsage: number;
  /** Monthly storage cost above the free tier, in USD. */
  monthly: number;
  /** One-time cost to download the library to each computer, in USD. */
  downloadCost: number;
  /** True when the paid plan has a fee that is not included in `monthly`. */
  extraPlanFee: boolean;
}

export const toGb = (bytes: number) => bytes / GB;

export const estimatePlan = (plan: StoragePlan, gb: number, computers: number): PlanEstimate => {
  const transferGb = gb * computers;
  const fitsFree = gb <= plan.freeGb && transferGb <= plan.freeTransferGb;
  if (fitsFree) {
    return { downloadCost: 0, extraPlanFee: false, fitsFree, freeUsage: gb / plan.freeGb, monthly: 0, plan };
  }
  const { paid } = plan;
  const monthly = (paid.baseMonthly ?? 0) + Math.max(0, gb - paid.includedGb) * paid.perGbMonth;
  const billableTransfer = Number.isFinite(plan.freeTransferGb) ? Math.max(0, transferGb - plan.freeTransferGb) : 0;
  return {
    downloadCost: billableTransfer * paid.perGbDownload,
    extraPlanFee: paid.baseMonthly === null,
    fitsFree,
    freeUsage: gb / plan.freeGb,
    monthly,
    plan,
  };
};

/** Typical size of a 320 kbps MP3 against each format, for the conversion estimate. */
const MP3_RATIO: Record<string, number> = { aiff: 0.227, flac: 0.44, wav: 0.227 };

/** Estimated size after converting lossless files to 320 kbps MP3. */
export const mp3EquivalentBytes = (scan: FolderScan) =>
  Object.entries(scan.formats).reduce((sum, [ext, f]) => sum + f.bytes * (MP3_RATIO[ext] ?? 1), 0);

/** Upload time in seconds at a given upload speed. */
export const uploadSeconds = (bytes: number, mbps: number) => (bytes * 8) / (mbps * 1_000_000);
