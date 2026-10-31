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
  autoCrawl?: boolean;
  crawlPages?: Record<string, CrawlPage | undefined>;
  crawlDiscoveredAt?: Stamp;
  crawlTotal?: number;
  crawlDown?: number;
  crawlBroken?: number;
  robot?: RobotInfo;
  days?: Days;
};

/** Robot de connexion d'un site : réglages (jamais le mot de passe) et dernier passage. */
export type RobotInfo = {
  enabled?: boolean;
  loginPath?: string;
  email?: string;
  hasPassword?: boolean;
  lastRunAt?: Stamp;
  ok?: boolean | null;
  reason?: string | null;
  loginOk?: boolean;
  pagesTested?: number;
  pagesFailed?: number;
  pagesBroken?: number;
  pages?: { path: string; status: number | null; ms: number | null; error: string | null }[];
};

/** Une page découverte par l'exploration automatique. `up` vaut vrai aussi pour une page protégée (qui demande une connexion). */
export type CrawlPage = {
  path: string;
  up?: boolean;
  protected?: boolean;
  everOk?: boolean;
  code?: number | null;
  latencyMs?: number | null;
  reason?: string | null;
  checkedAt?: Stamp;
};

/** Problèmes en cours qui rendent un site « partiel » : fonctionnalités en panne + pages découvertes qui ne répondent plus. */
export const problemCount = (m: { featuresDown?: number; crawlDown?: number; robot?: { enabled?: boolean; ok?: boolean | null } }) =>
  (m.featuresDown ?? 0) + (m.crawlDown ?? 0) + (m.robot?.enabled && m.robot.ok === false ? 1 : 0);

export type IncidentKind = "down" | "slow" | "ssl" | "feature" | "page" | "robot";

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

export const INCIDENT_LABEL: Record<IncidentKind, string> = { down: "Panne", slow: "Lenteur", ssl: "Certificat SSL", feature: "Fonctionnalité", page: "Page", robot: "Robot de connexion" };

export const dateOf = (s: Stamp): Date | undefined => s?.toDate?.();
