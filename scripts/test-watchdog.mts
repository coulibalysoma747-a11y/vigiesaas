import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error : module JavaScript sans types
import { decide, evaluate, formatDuration } from "./watchdog.mjs";
import { cronAgeMin, cronStale } from "../src/lib/heartbeat.ts";

test("santé : réponse 200 saine, erreur, aucune réponse, contrôle automatique arrêté", () => {
  assert.equal(evaluate({ status: 200, body: { ok: true, cronAgeMin: 3, cronStale: false } }).healthy, true);
  assert.equal(evaluate({ status: 200, body: { ok: true, cronAgeMin: null, cronStale: false } }).healthy, true);
  const down = evaluate({ status: 503, body: null });
  assert.equal(down.healthy, false);
  assert.equal(down.retry, true);
  assert.equal(evaluate({ status: 0, body: null }).retry, true);
  const stale = evaluate({ status: 200, body: { ok: true, cronAgeMin: 45, cronStale: true } });
  assert.equal(stale.healthy, false);
  assert.equal(stale.retry, false);
  assert.match(stale.reason, /45 minutes/);
});

test("décision : ouvrir, relancer toutes les heures, fermer, ne rien faire", () => {
  const now = 10_000_000_000;
  assert.equal(decide({ healthy: false, openIssue: null, nowMs: now }), "open");
  assert.equal(decide({ healthy: false, openIssue: { number: 1, updatedAtMs: now - 10 * 60_000 }, nowMs: now }), "none");
  assert.equal(decide({ healthy: false, openIssue: { number: 1, updatedAtMs: now - 61 * 60_000 }, nowMs: now }), "remind");
  assert.equal(decide({ healthy: true, openIssue: { number: 1, updatedAtMs: now }, nowMs: now }), "close");
  assert.equal(decide({ healthy: true, openIssue: null, nowMs: now }), "none");
});

test("durée lisible", () => {
  assert.equal(formatDuration(5 * 60_000), "5 min");
  assert.equal(formatDuration(125 * 60_000), "2 h 05");
});

test("battement : âge du contrôle automatique et seuil de 20 minutes", () => {
  const now = 1_000_000_000_000;
  assert.equal(cronAgeMin(null, now), null);
  assert.equal(cronAgeMin(now - 4 * 60_000, now), 4);
  assert.equal(cronStale(null), false);
  assert.equal(cronStale(20), false);
  assert.equal(cronStale(21), true);
});
