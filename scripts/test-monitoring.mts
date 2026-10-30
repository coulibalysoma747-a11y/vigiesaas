// Tests de la logique de surveillance : node --test scripts/test-monitoring.mts (Node 22.18 ou plus récent)
import assert from "node:assert/strict";
import test from "node:test";
import {
  dayDelta, dayKey, dayState, describeFailure, formatDuration, formatPct, isDue, isPrivateAddress, lastDayKeys,
  normalizeInterval, parseMonitorUrl, shortHost, staleDayKeys, summarize, transition,
} from "../src/lib/monitoring.ts";

const NOW = new Date("2026-10-30T12:00:00Z");

test("clés de jour : UTC, sans tiret, 30 jours de la plus ancienne à aujourd'hui", () => {
  assert.equal(dayKey(NOW), "d20261030");
  assert.equal(dayKey(new Date("2026-01-05T23:59:59Z")), "d20260105");
  const keys = lastDayKeys(NOW);
  assert.equal(keys.length, 30);
  assert.equal(keys[29], "d20261030");
  assert.equal(keys[0], "d20261001");
  assert.equal(lastDayKeys(new Date("2026-03-02T00:00:00Z"), 3).join(), "d20260228,d20260301,d20260302");
});

test("compteurs du jour : le temps de réponse ne compte que pour un contrôle réussi", () => {
  assert.deepEqual(dayDelta(NOW, true, 142), { key: "d20261030", c: 1, u: 1, l: 142, ln: 1 });
  assert.deepEqual(dayDelta(NOW, false, null), { key: "d20261030", c: 1, u: 0, l: 0, ln: 0 });
  assert.deepEqual(dayDelta(NOW, false, 9000), { key: "d20261030", c: 1, u: 0, l: 0, ln: 0 });
  assert.deepEqual(dayDelta(NOW, true, null), { key: "d20261030", c: 1, u: 1, l: 0, ln: 0 });
});

test("jours à effacer : seulement ceux qui sortent de la fenêtre de 30 jours, jamais un champ étranger", () => {
  const days = { d20260901: { c: 5 }, d20261001: { c: 5 }, d20261030: { c: 2 }, autre: { c: 1 } };
  assert.deepEqual(staleDayKeys(days, NOW), ["d20260901"]);
  assert.deepEqual(staleDayKeys(undefined, NOW), []);
});

test("état d'une journée : 99,5 % en ligne, 90 % dégradé, en dessous hors ligne, aucun contrôle = vide", () => {
  assert.equal(dayState(undefined).state, "none");
  assert.equal(dayState({ c: 0 }).state, "none");
  assert.equal(dayState({ c: 288, u: 288 }).state, "up");
  assert.equal(dayState({ c: 200, u: 199 }).state, "up"); // 99,5 %
  assert.equal(dayState({ c: 100, u: 95 }).state, "degraded");
  assert.equal(dayState({ c: 100, u: 50 }).state, "down");
});

test("résumé sur 30 jours : disponibilité, temps de réponse moyen et barres", () => {
  const days = { d20261029: { c: 288, u: 288, l: 288 * 100, ln: 288 }, d20261030: { c: 12, u: 6, l: 6 * 400, ln: 6 } };
  const s = summarize(days, NOW);
  assert.equal(s.checks, 300);
  assert.equal(Math.round((s.uptimePct as number) * 100) / 100, 98);
  assert.equal(s.avgLatencyMs, Math.round((288 * 100 + 6 * 400) / 294));
  assert.equal(s.bars.length, 30);
  assert.equal(s.bars[29].state, "down");
  assert.equal(s.bars[28].state, "up");
  assert.equal(s.bars[0].state, "none");
  assert.equal(summarize(undefined, NOW).uptimePct, null);
  assert.equal(summarize({}, NOW).avgLatencyMs, null);
});

test("pourcentage : arrondi vers le bas, jamais 100 % après une panne", () => {
  assert.equal(formatPct(null), "—");
  assert.equal(formatPct(100), "100,00 %");
  assert.equal(formatPct(99.999), "99,99 %");
  assert.equal(formatPct(99.96), "99,96 %");
  assert.equal(formatPct(0), "0,00 %");
});

test("fréquence : 5, 10, 30 ou 60 minutes, sinon 5 ; un site est à contrôler une fois son intervalle écoulé", () => {
  assert.equal(normalizeInterval(10), 10);
  assert.equal(normalizeInterval("60"), 60);
  assert.equal(normalizeInterval(7), 5);
  assert.equal(normalizeInterval(undefined), 5);
  const t = 1_000_000_000;
  assert.equal(isDue(null, 5, t), true);
  assert.equal(isDue(t - 5 * 60_000, 5, t), true);
  assert.equal(isDue(t - 4 * 60_000 - 40_000, 5, t), true); // dérive du déclencheur tolérée
  assert.equal(isDue(t - 4 * 60_000, 5, t), false);
  assert.equal(isDue(t - 20 * 60_000, 30, t), false);
  assert.equal(isDue(t - 30 * 60_000, 30, t), true);
});

test("changements d'état : panne, retour, première vérification en panne, et rien sinon", () => {
  assert.equal(transition(true, false), "went_down");
  assert.equal(transition(false, true), "recovered");
  assert.equal(transition(null, false), "first_down");
  assert.equal(transition(null, true), "none");
  assert.equal(transition(true, true), "none");
  assert.equal(transition(false, false), "none");
});

test("textes de panne et durées", () => {
  assert.equal(describeFailure(null, "timeout"), "Délai dépassé (10 s)");
  assert.equal(describeFailure(null, "dns"), "Adresse introuvable (DNS)");
  assert.equal(describeFailure(503, null), "Réponse HTTP 503");
  assert.equal(describeFailure(null, null), "Pas de réponse");
  assert.equal(formatDuration(20), "moins d'une minute");
  assert.equal(formatDuration(8 * 60), "8 min");
  assert.equal(formatDuration(2 * 3600), "2 h");
  assert.equal(formatDuration(2 * 3600 + 5 * 60), "2 h 5 min");
  assert.equal(formatDuration(3 * 86400 + 4 * 3600), "3 j 4 h");
});

test("adresses privées refusées (le serveur ne doit jamais lire le réseau interne)", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "[::1]"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "193.168.0.1", "2606:4700:4700::1111", "exemple.com"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("adresse d'un site : https ajouté, formes détournées refusées", () => {
  const ok = parseMonitorUrl("mon-saas.com");
  assert.ok(ok.ok && ok.url === "https://mon-saas.com/" && ok.host === "mon-saas.com");
  assert.ok(parseMonitorUrl("http://exemple.com:8080/sante?x=1").ok);
  assert.ok(parseMonitorUrl("  https://WWW.Exemple.com  ").ok);
  for (const bad of [
    "", "   ", "javascript:alert(1)", "ftp://exemple.com", "file:///etc/passwd", "http://localhost", "http://localhost:3000/admin",
    "http://127.0.0.1", "http://2130706433", "http://0x7f.1", "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1", "http://192.168.0.10", "https://intranet", "https://api.local", "https://service.internal", "https://user:pass@exemple.com",
    "https://metadata.google.internal", "http://[::ffff:127.0.0.1]/", "http://box.home.arpa",
  ]) {
    assert.equal(parseMonitorUrl(bad).ok, false, bad);
  }
  assert.equal(parseMonitorUrl("x".repeat(2001)).ok, false);
  assert.equal(shortHost("https://www.exemple.com/page"), "exemple.com");
});
