// Tests de la logique de surveillance : node --test scripts/test-monitoring.mts (Node 22.18 ou plus récent)
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeatureList, extractLinks, featureUrl, nameFromPath, normalizeExpectStatus, normalizeFeature, siteHealth,
  bodyHasText, dayDelta, dayKey, dayState, daysUntil, describeFailure, describeSlow, describeSsl, evalSlow, formatDuration, formatPct, isDue,
  isPrivateAddress, lastDayKeys, normalizeExpectText, normalizeInterval, normalizeMaxLatency, parseMonitorUrl, shortHost, sslChange, sslDue,
  sslLevel, staleDayKeys, summarize, transition,
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

test("contenu attendu : texte nettoyé, 200 caractères au plus, recherche sans tenir compte des majuscules ni des espaces", () => {
  assert.equal(normalizeExpectText("  Se   connecter \n "), "Se connecter");
  assert.equal(normalizeExpectText(""), null);
  assert.equal(normalizeExpectText("   "), null);
  assert.equal(normalizeExpectText(undefined), null);
  assert.equal(normalizeExpectText("x".repeat(500))?.length, 200);
  assert.equal(bodyHasText("<h1>Bienvenue   sur\nmon SITE</h1>", "bienvenue sur mon site"), true);
  assert.equal(bodyHasText("<h1>Erreur 500</h1>", "Bienvenue"), false);
  assert.equal(bodyHasText("", "x"), false);
});

test("limite de lenteur : seulement 0,5, 1, 2, 3 ou 5 secondes, sinon désactivée", () => {
  assert.equal(normalizeMaxLatency(2000), 2000);
  assert.equal(normalizeMaxLatency("500"), 500);
  assert.equal(normalizeMaxLatency(0), null);
  assert.equal(normalizeMaxLatency(""), null);
  assert.equal(normalizeMaxLatency(null), null);
  assert.equal(normalizeMaxLatency(1234), null);
  assert.equal(describeSlow(3200, 2000), "Lent : 3,2 s (limite 2,0 s)");
});

test("lenteur : signalée après 3 contrôles lents d'affilée, levée au premier contrôle rapide, jamais sur un site hors ligne", () => {
  let s = evalSlow({}, true, 3000, 2000);
  assert.deepEqual(s, { streak: 1, isSlow: false, change: "none" });
  s = evalSlow(s, true, 2500, 2000);
  assert.deepEqual(s, { streak: 2, isSlow: false, change: "none" });
  s = evalSlow(s, true, 2100, 2000);
  assert.deepEqual(s, { streak: 3, isSlow: true, change: "became_slow" });
  s = evalSlow(s, true, 4000, 2000); // toujours lent : pas de nouvelle alerte
  assert.deepEqual(s, { streak: 4, isSlow: true, change: "none" });
  s = evalSlow(s, true, 900, 2000);
  assert.deepEqual(s, { streak: 0, isSlow: false, change: "back_to_normal" });
  assert.deepEqual(evalSlow({ streak: 2 }, true, 500, 2000), { streak: 0, isSlow: false, change: "none" }); // un pic isolé ne compte pas
  assert.deepEqual(evalSlow({ streak: 2, isSlow: false }, false, null, 2000), { streak: 0, isSlow: false, change: "none" }); // hors ligne
  assert.deepEqual(evalSlow({ streak: 5, isSlow: true }, true, 9000, null), { streak: 0, isSlow: false, change: "none" }); // contrôle désactivé
  assert.deepEqual(evalSlow({}, true, 2000, 2000), { streak: 0, isSlow: false, change: "none" }); // pile sur la limite : pas lent
});

test("certificat SSL : niveaux, alertes seulement quand ça empire ou que c'est réparé, jamais de répétition", () => {
  assert.equal(sslLevel({ authorized: true, daysLeft: 90 }), "ok");
  assert.equal(sslLevel({ authorized: true, daysLeft: 15 }), "ok");
  assert.equal(sslLevel({ authorized: true, daysLeft: 14 }), "warn14");
  assert.equal(sslLevel({ authorized: true, daysLeft: 4 }), "warn14");
  assert.equal(sslLevel({ authorized: true, daysLeft: 3 }), "warn3");
  assert.equal(sslLevel({ authorized: true, daysLeft: 0 }), "warn3");
  assert.equal(sslLevel({ authorized: false, daysLeft: -2 }), "expired");
  assert.equal(sslLevel({ authorized: false, daysLeft: 60 }), "invalid"); // auto-signé ou mauvais nom
  assert.equal(sslLevel({ authorized: true, daysLeft: null }), "invalid");
  assert.equal(sslChange(undefined, "ok"), "none");
  assert.equal(sslChange("ok", "warn14"), "worse");
  assert.equal(sslChange("warn14", "warn14"), "none");
  assert.equal(sslChange("warn14", "warn3"), "worse");
  assert.equal(sslChange("warn3", "expired"), "worse");
  assert.equal(sslChange(undefined, "invalid"), "worse");
  assert.equal(sslChange("warn3", "warn14"), "none"); // amélioration partielle : pas de message
  assert.equal(sslChange("warn14", "ok"), "fixed");
  assert.equal(sslChange("expired", "ok"), "fixed");
  assert.equal(daysUntil(new Date("2026-11-30T12:00:00Z"), NOW), 31);
  assert.equal(daysUntil(new Date("2026-10-29T12:00:00Z"), NOW), -1);
  const t = 1_000_000_000_000;
  assert.equal(sslDue(null, t), true);
  assert.equal(sslDue(t - 13 * 3_600_000, t), true);
  assert.equal(sslDue(t - 11 * 3_600_000, t), false);
  assert.equal(describeSsl("warn14", 9), "Le certificat SSL expire dans 9 jours");
  assert.equal(describeSsl("warn3", 1), "Le certificat SSL expire dans 1 jour");
  assert.equal(describeSsl("expired", -2), "Le certificat SSL a expiré");
  assert.match(describeSsl("invalid", null), /invalide/);
  assert.equal(describeSsl("ok", 60), "Certificat SSL valide (expire dans 60 jours)");
});

const BASE = "https://mon-saas.com/accueil";

test("fonctionnalité : l'adresse reste TOUJOURS sur le même site (jamais un autre domaine ni « //autre.com »)", () => {
  const ok = featureUrl(BASE, "/connexion");
  assert.ok(ok.ok && ok.path === "/connexion" && ok.url === "https://mon-saas.com/connexion");
  assert.ok(featureUrl(BASE, "api/health?x=1").ok && (featureUrl(BASE, "api/health?x=1") as { path: string }).path === "/api/health?x=1");
  assert.ok(featureUrl(BASE, "https://mon-saas.com/paiement").ok);
  for (const bad of ["", "   ", "//evil.com/x", "https://evil.com/x", "http://mon-saas.com/x", "https://mon-saas.com.evil.com/x", "https://sous.mon-saas.com/x", "/a b", "/a\b", "\\evil.com", "javascript:alert(1)", "/" + "x".repeat(400)]) {
    assert.equal(featureUrl(BASE, bad).ok, false, bad);
  }
  assert.equal(featureUrl("pas une adresse", "/x").ok, false);
  assert.equal(normalizeExpectStatus(200), 200);
  assert.equal(normalizeExpectStatus("401"), 401);
  assert.equal(normalizeExpectStatus(99), null);
  assert.equal(normalizeExpectStatus(600), null);
  assert.equal(normalizeExpectStatus(""), null);
  assert.equal(normalizeExpectStatus(2.5), null);
});

test("fonctionnalité : nom proposé à partir de l'adresse, texte et code attendus nettoyés", () => {
  assert.equal(nameFromPath("/connexion"), "Connexion");
  assert.equal(nameFromPath("/api/health-check"), "Health check");
  assert.equal(nameFromPath("/"), "Accueil");
  assert.equal(nameFromPath("/panier?x=1"), "Panier");
  assert.equal(nameFromPath("/%E0%A4%A"), "%E0%A4%A"); // texte mal encodé : gardé tel quel, sans planter
  const f = normalizeFeature(BASE, { name: "  Paiement   Mobile ", path: "paiement", expectStatus: "200", expectText: "  Payer  " });
  assert.deepEqual(f, { ok: true, feature: { name: "Paiement Mobile", path: "/paiement", expectStatus: 200, expectText: "Payer" } });
  assert.deepEqual(normalizeFeature(BASE, { path: "/api/sante" }), { ok: true, feature: { name: "Sante", path: "/api/sante", expectStatus: null, expectText: null } });
  assert.equal(normalizeFeature(BASE, { path: "https://evil.com" }).ok, false);
});

test("liste de fonctionnalités : doublons retirés, identifiants conservés, 8 au plus", () => {
  let n = 0;
  const makeId = () => `id${++n}`;
  const r = buildFeatureList(BASE, [{ id: "abc", path: "/a" }, { path: "/b" }, { path: "/a" }, { id: "abc", path: "/c" }], new Set(["abc"]), makeId);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.features.map((f) => f.path), ["/a", "/b", "/c"]);
    assert.equal(r.features[0].id, "abc"); // conservé
    assert.notEqual(r.features[2].id, "abc"); // doublon d'identifiant : nouvel identifiant
    assert.equal(new Set(r.features.map((f) => f.id)).size, 3);
  }
  assert.ok(buildFeatureList(BASE, [], new Set(), makeId).ok);
  assert.ok(buildFeatureList(BASE, "pas une liste", new Set(), makeId).ok);
  const nine = Array.from({ length: 9 }, (_, i) => ({ path: `/p${i}` }));
  assert.equal(buildFeatureList(BASE, nine, new Set(), makeId).ok, false);
  const bad = buildFeatureList(BASE, [{ name: "Pirate", path: "https://evil.com/x" }], new Set(), makeId);
  assert.ok(!bad.ok && bad.error.startsWith("Pirate :"));
});

test("santé d'un site : hors ligne, partiel (répond mais une fonctionnalité est en panne), en ligne", () => {
  assert.equal(siteHealth(null, 0), null);
  assert.equal(siteHealth(undefined, 2), null);
  assert.equal(siteHealth(false, 0), "down");
  assert.equal(siteHealth(false, 3), "down");
  assert.equal(siteHealth(true, 0), "up");
  assert.equal(siteHealth(true, undefined), "up");
  assert.equal(siteHealth(true, 1), "degraded");
});

test("détection des pages : liens du même site seulement, sans fichiers, connexion et paiement d'abord", () => {
  const html = `
    <nav><a href="/blog">Blog</a> <a href="/connexion"><span>Se connecter</span></a> <a class="x" href='/paiement?plan=pro'>Payer</a>
    <a href="https://evil.com/phish">Offre</a> <a href="//cdn.evil.com/x">CDN</a> <a href="mailto:a@b.com">Écrire</a> <a href="javascript:alert(1)">Pirate</a>
    <a href="/logo.png">Logo</a> <a href="/style.css">CSS</a> <a href="#haut">Haut</a> <a href="/">Accueil</a> <a href="/connexion">Doublon</a>
    <a href="/a-propos">À propos</a> <a href="https://mon-saas.com/api/health">Santé</a> <a href="https://autre.mon-saas.com/x">Sous-domaine</a></nav>`;
  const links = extractLinks(html, "https://mon-saas.com/");
  const paths = links.map((l) => l.path);
  assert.deepEqual(paths.slice(0, 3).sort(), ["/api/health", "/connexion", "/paiement?plan=pro"]); // les pages importantes d'abord
  assert.ok(paths.includes("/blog") && paths.includes("/a-propos"));
  for (const forbidden of ["/", "/logo.png", "/style.css", "/phish", "/x"]) assert.ok(!paths.includes(forbidden), forbidden);
  assert.equal(paths.filter((p) => p === "/connexion").length, 1);
  assert.equal(links.find((l) => l.path === "/connexion")?.name, "Se connecter");
  assert.equal(extractLinks(html, "pas une adresse").length, 0);
  assert.equal(extractLinks(html, "https://mon-saas.com/", 2).length, 2);
});
