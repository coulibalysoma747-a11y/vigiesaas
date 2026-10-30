import type { Days } from "@/lib/monitoring";

type Stamp = { toDate: () => Date } | null | undefined;

/** Un site surveillé, tel que lu dans Firestore par le navigateur. */
export type Monitor = {
  id: string;
  userId: string;
  name: string;
  url: string;
  isActive?: boolean;
  intervalMin?: number;
  lastStatus: boolean | null;
  lastCode?: number | null;
  lastError?: string | null;
  lastLatencyMs?: number | null;
  lastCheckedAt?: Stamp;
  lastChangedAt?: Stamp;
  days?: Days;
};

export type Incident = {
  id: string;
  userId: string;
  monitorId: string;
  monitorName: string;
  url: string;
  startedAt?: Stamp;
  resolvedAt?: Stamp;
  durationSec?: number | null;
  reason?: string;
};

export const dateOf = (s: Stamp): Date | undefined => s?.toDate?.();
