import type { Days, SslLevel } from "@/lib/monitoring";

type Stamp = { toDate: () => Date } | null | undefined;

/** Un site surveillé, tel que lu dans Firestore par le navigateur. */
export type Monitor = {
  id: string;
  userId: string;
  name: string;
  url: string;
  isActive?: boolean;
  intervalMin?: number;
  expectText?: string | null;
  maxLatencyMs?: number | null;
  sslCheck?: boolean;
  lastStatus: boolean | null;
  lastCode?: number | null;
  lastError?: string | null;
  lastLatencyMs?: number | null;
  lastContentOk?: boolean | null;
  lastCheckedAt?: Stamp;
  lastChangedAt?: Stamp;
  isSlow?: boolean;
  sslLevel?: SslLevel | null;
  sslDaysLeft?: number | null;
  sslExpiresAt?: Stamp;
  days?: Days;
};

export type IncidentKind = "down" | "slow" | "ssl";

export type Incident = {
  id: string;
  userId: string;
  monitorId: string;
  monitorName: string;
  url: string;
  kind?: IncidentKind;
  startedAt?: Stamp;
  resolvedAt?: Stamp;
  durationSec?: number | null;
  reason?: string;
};

export const INCIDENT_LABEL: Record<IncidentKind, string> = { down: "Panne", slow: "Lenteur", ssl: "Certificat SSL" };

export const dateOf = (s: Stamp): Date | undefined => s?.toDate?.();
