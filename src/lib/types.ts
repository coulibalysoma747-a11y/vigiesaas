import type { Days, Feature, SslLevel } from "@/lib/monitoring";

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
  features?: Feature[];
  featureState?: Record<string, { up?: boolean; code?: number | null; latencyMs?: number | null; reason?: string | null; checkedAt?: Stamp; changedAt?: Stamp } | undefined>;
  featuresDown?: number;
  days?: Days;
};

export type IncidentKind = "down" | "slow" | "ssl" | "feature";

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

export const INCIDENT_LABEL: Record<IncidentKind, string> = { down: "Panne", slow: "Lenteur", ssl: "Certificat SSL", feature: "Fonctionnalité" };

export const dateOf = (s: Stamp): Date | undefined => s?.toDate?.();
