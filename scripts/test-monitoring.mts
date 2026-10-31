// Tests de la logique de surveillance : node --test scripts/test-monitoring.mts (Node 22.18 ou plus récent)
import assert from "node:assert/strict";
import test from "node:test";
import * as robotRules from "../robot/rules.mjs";
import { diagnose } from "../src/lib/diagnosis.ts";
import { decryptSecret, encryptSecret, vaultReady } from "../src/lib/robot-crypto.ts";
import {
  ROBOT_FORBIDDEN, parseScenario, sanitizeSteps,
  effectiveInterval, reminderDue,
  normalizeRobotConfig, robotVerdict, sanitizeRobotReport,
  crawlDue, crawlLinks, crawlPath, fnv1a, mergeDiscovered, pageKey, pageStep, problemTotal,
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

const SITE = "https://mon-saas.com/";

test("exploration : empreinte stable, nom de champ sûr", () => {
  assert.equal(fnv1a("/connexion"), fnv1a("/connexion"));
  assert.notEqual(fnv1a("/connexion"), fnv1a("/paiement"));
  assert.match(fnv1a("x"), /^[0-9a-f]{8}$/);
  assert.match(pageKey("/a/b?x=1"), /^p[0-9a-f]{8}$/);
});

test("exploration : seules les pages du MÊME site sont gardées, sans fichiers, sans « ? » ni « # », sans « / » final", () => {
  assert.equal(crawlPath("/connexion", SITE), "/connexion");
  assert.equal(crawlPath("connexion/", "https://mon-saas.com/a/"), "/a/connexion");
  assert.equal(crawlPath("/panier?x=1#haut", SITE), "/panier");
  assert.equal(crawlPath("https://mon-saas.com/tarifs/", SITE), "/tarifs");
  assert.equal(crawlPath("../b", "https://mon-saas.com/a/c/"), "/a/b");
  for (const bad of ["", "#haut", "/", "//", "https://evil.com/x", "//evil.com/x", "https://sous.mon-saas.com/x", "http://mon-saas.com/x", "mailto:a@b.com", "javascript:alert(1)", "tel:123", "/logo.png", "/app.js", "/doc.pdf"]) {
    assert.equal(crawlPath(bad, SITE), null, bad);
  }
  assert.equal(crawlPath("/" + "x".repeat(300), SITE), null);
  assert.equal(crawlPath("/a b", SITE), "/a%20b"); // un espace dans un lien est encodé comme le ferait un navigateur
});

test("exploration : liens d'une page, sans doublon, dans l'ordre", () => {
  const html = `<a href="/a">A</a><a href='/b?x=1'>B</a><a href="/a#fin">A bis</a><a href="https://evil.com/z">Z</a><a href="/img.png">I</a><a href="/c/">C</a><a name="ancre">sans lien</a>`;
  assert.deepEqual(crawlLinks(html, SITE), ["/a", "/b", "/c"]);
  assert.deepEqual(crawlLinks("", SITE), []);
});

test("exploration : fusion des pages connues et découvertes, oubli après 3 explorations sans la retrouver, plafond", () => {
  const first = mergeDiscovered({}, ["/a", "/b", "/c"]);
  assert.deepEqual(Object.values(first.pages).map((p) => p.path), ["/a", "/b", "/c"]);
  assert.equal(first.added.length, 3);
  let pages = first.pages;
  let step = mergeDiscovered(pages, ["/a", "/c"]); // « /b » n'est plus trouvée une fois
  assert.equal(step.pages[pageKey("/b")].missing, 1);
  assert.equal(step.dropped.length, 0);
  pages = step.pages;
  step = mergeDiscovered(pages, ["/a", "/c"]);
  pages = step.pages;
  step = mergeDiscovered(pages, ["/a", "/c"]); // 3e fois : oubliée
  assert.deepEqual(step.dropped, [pageKey("/b")]);
  assert.ok(!(pageKey("/b") in step.pages));
  step = mergeDiscovered(first.pages, ["/a", "/b"]); // retrouvée : le compteur repart à zéro
  assert.equal(step.pages[pageKey("/b")].missing, 0);
  const many = mergeDiscovered({}, Array.from({ length: 30 }, (_, i) => `/p${i}`), 20);
  assert.equal(Object.keys(many.pages).length, 20);
  const kept = mergeDiscovered({ [pageKey("/old")]: { path: "/old", missing: 0 } }, Array.from({ length: 30 }, (_, i) => `/p${i}`), 5);
  assert.ok(pageKey("/old") in kept.pages); // une page déjà connue n'est jamais chassée par une nouvelle
  assert.equal(Object.keys(kept.pages).length, 5);
});

test("exploration : lien cassé (jamais marché) ≠ panne (marchait avant) ; réparation sans alerte si jamais marché", () => {
  assert.equal(pageStep(undefined, true), "none");
  assert.equal(pageStep(undefined, false), "broken");
  assert.equal(pageStep({}, false), "broken");
  assert.equal(pageStep({ up: true, everOk: true }, false), "went_down");
  assert.equal(pageStep({ up: false, everOk: true }, true), "recovered");
  assert.equal(pageStep({ up: false, everOk: false }, true), "none"); // lien cassé réparé : pas d'alerte
  assert.equal(pageStep({ up: true, everOk: true }, true), "none");
  assert.equal(pageStep({ up: false, everOk: true }, false), "none"); // toujours en panne : pas de nouvelle alerte
});

test("exploration : redécouverte toutes les 6 heures, ou sur demande ; total des problèmes", () => {
  const t = 1_000_000_000_000;
  assert.equal(crawlDue(null, t), true);
  assert.equal(crawlDue(t - 7 * 3_600_000, t), true);
  assert.equal(crawlDue(t - 5 * 3_600_000, t), false);
  assert.equal(crawlDue(t - 60_000, t, true), true);
  assert.equal(problemTotal(2, 3), 5);
  assert.equal(problemTotal(undefined, null), 0);
  assert.equal(problemTotal(1, undefined), 1);
});

test("robot : réglages validés (page de connexion du même site, identifiant, mot de passe jamais dans la configuration)", () => {
  const ok = normalizeRobotConfig("https://mon-saas.com", { enabled: true, loginPath: "connexion", email: " test@exemple.com ", password: "Secret123!" }, false);
  assert.deepEqual(ok, { ok: true, config: { enabled: true, loginPath: "/connexion", email: "test@exemple.com" }, password: "Secret123!" });
  assert.deepEqual(normalizeRobotConfig("https://mon-saas.com", { enabled: true, email: "t@e.fr" }, true), { ok: true, config: { enabled: true, loginPath: "/connexion", email: "t@e.fr" }, password: null }); // mot de passe déjà enregistré : conservé
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, email: "t@e.fr" }, false).ok, false); // activé sans mot de passe
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: false, email: "t@e.fr" }, false).ok, true); // désactivé : pas besoin de mot de passe
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, loginPath: "https://evil.com/login", email: "t@e.fr", password: "x" }, false).ok, false); // jamais un autre site
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, loginPath: "//evil.com", email: "t@e.fr", password: "x" }, false).ok, false);
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, email: "a", password: "x" }, false).ok, false);
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, email: "a b@c.fr", password: "x" }, false).ok, false);
  assert.equal(normalizeRobotConfig("https://mon-saas.com", { enabled: true, email: "t@e.fr", password: "x".repeat(201) }, false).ok, false);
});

test("robot : le rapport de l'exécuteur n'est jamais cru sur parole (types, tailles, caractères)", () => {
  assert.equal(sanitizeRobotReport(null), null);
  assert.equal(sanitizeRobotReport("x"), null);
  assert.equal(sanitizeRobotReport({ pages: [] }), null); // loginOk manquant
  assert.equal(sanitizeRobotReport({ loginOk: "oui" }), null);
  const r = sanitizeRobotReport({
    loginOk: true, loginError: null,
    pages: [
      { path: "/app", status: 200, ms: 350.6, error: null },
      { path: "pas-un-chemin", status: 200 }, // retiré
      { path: "/x\n/y", status: 99999, ms: -5, error: "e".repeat(500) },
      ...Array.from({ length: 50 }, (_, i) => ({ path: `/p${i}`, status: 200, ms: 1 })),
    ],
  });
  assert.ok(r);
  if (r) {
    assert.equal(r.pages.length, 29); // 30 entrées lues au plus, dont une retirée (chemin invalide)
    assert.deepEqual(r.pages[0], { path: "/app", status: 200, ms: 351, error: null, warn: null });
    assert.deepEqual(r.pages[1], { path: "/x /y", status: null, ms: null, error: "e".repeat(120), warn: null });
    assert.deepEqual(r.steps, []);
    assert.equal(r.clicks, 0);
  }
  const withSteps = sanitizeRobotReport({
    loginOk: true, pages: [{ path: "/a", status: 200, warn: "w".repeat(300) }],
    steps: [{ text: "aller à /a", ok: true }, { text: "voir « x »", ok: false, error: "introuvable" }, { text: "", ok: true }, { text: "sans ok" }, ...Array.from({ length: 40 }, () => ({ text: "t", ok: true }))],
    clicks: 12.5,
  });
  assert.ok(withSteps);
  if (withSteps) {
    assert.equal(withSteps.pages[0].warn?.length, 120);
    assert.equal(withSteps.steps.length, 20 - 2); // 20 lues au plus ; 2 invalides retirées
    assert.deepEqual(withSteps.steps[1], { text: "voir « x »", ok: false, error: "introuvable" });
    assert.equal(withSteps.clicks, 0); // pas un entier : refusé
  }
  assert.equal(sanitizeRobotReport({ loginOk: true, pages: [], clicks: 9999 })?.clicks, 500);
});

test("robot : verdict — connexion impossible, page en erreur, lien cassé (404) sans panne", () => {
  const page = (path: string, status: number | null, error: string | null = null) => ({ path, status, ms: 100, error, warn: null });
  const base = { loginOk: true, loginError: null, steps: [], clicks: 0 };
  assert.deepEqual(robotVerdict({ ...base, pages: [page("/app", 200), page("/app/paiements", 200)] }), { ok: true, reason: null, failed: [], broken: [], failedSteps: [] });
  const noLogin = robotVerdict({ ...base, loginOk: false, loginError: "Connexion refusée : « Mot de passe incorrect »", pages: [] });
  assert.equal(noLogin.ok, false);
  assert.equal(noLogin.reason, "Connexion impossible : Connexion refusée : « Mot de passe incorrect »");
  assert.match(robotVerdict({ ...base, loginOk: false, pages: [] }).reason ?? "", /n'a pas pu se connecter/);
  const err = robotVerdict({ ...base, pages: [page("/app", 200), page("/app/retraits", 500), page("/app/factures", null, "Délai dépassé"), page("/app/ancien", 404)] });
  assert.equal(err.ok, false);
  assert.equal(err.reason, "2 pages de l'application en erreur : /app/retraits (HTTP 500), /app/factures (Délai dépassé)");
  assert.deepEqual(err.broken.map((p) => p.path), ["/app/ancien"]);
  const onlyBroken = robotVerdict({ ...base, pages: [page("/app", 200), page("/app/ancien", 404)] });
  assert.equal(onlyBroken.ok, true); // un 404 n'est pas une panne
  assert.equal(onlyBroken.broken.length, 1);
  const many = robotVerdict({ ...base, pages: ["/a", "/b", "/c", "/d", "/e"].map((p) => page(p, 503)) });
  assert.match(many.reason ?? "", /5 pages .* et 2 autres$/);
  // Une remarque (erreur JavaScript) n'est jamais une panne ; un geste de scénario en échec en est une.
  const warned = robotVerdict({ ...base, pages: [{ ...page("/app", 200), warn: "Erreur JavaScript : x" }] });
  assert.equal(warned.ok, true);
  const stepFail = robotVerdict({ ...base, pages: [page("/app", 200)], steps: [{ text: "aller à /app", ok: true, error: null }, { text: "voir « Lien créé »", ok: false, error: "introuvable (délai dépassé)" }] });
  assert.equal(stepFail.ok, false);
  assert.equal(stepFail.reason, "scénario en échec à « voir « Lien créé » » (introuvable (délai dépassé))");
  const both = robotVerdict({ ...base, pages: [page("/app/x", 500)], steps: [{ text: "cliquer sur « Go »", ok: false, error: null }] });
  assert.match(both.reason ?? "", /1 page de l'application en erreur : \/app\/x \(HTTP 500\) ; scénario en échec à « cliquer sur « Go » »$/);
});

test("scénario : lecture des gestes, erreurs claires, aucun geste dangereux", () => {
  const url = "https://exemple.com";
  const ok = parseScenario(url, "# commentaire\n\naller à /paiements\ncliquer sur « Créer un lien »\nremplir Montant avec 1000\nvoir Lien créé\nattendre 2\nVa sur /app/retraits");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.steps, [
      { a: "goto", t: "/paiements" }, { a: "click", t: "Créer un lien" }, { a: "fill", t: "Montant", v: "1000" },
      { a: "see", t: "Lien créé" }, { a: "wait", t: "2" }, { a: "goto", t: "/app/retraits" },
    ]);
    assert.equal(ok.lines.length, 6);
  }
  assert.deepEqual(parseScenario(url, ""), { ok: true, steps: [], lines: [] });
  const bad = (text: string) => { const r = parseScenario(url, text); return r.ok ? "OK" : r.error; };
  assert.match(bad("voir ok\nfaire un truc"), /^Ligne 2 : geste non compris/);
  assert.match(bad("aller à https://autre.com/x"), /^Ligne 1 : .*pas une page de ton site/);
  assert.match(bad("attendre 30"), /entre 1 et 5 secondes/);
  assert.match(bad("cliquer sur Supprimer mon compte"), /action que le robot n'a pas le droit de faire/);
  assert.match(bad("cliquer sur Retirer l'argent"), /pas le droit/);
  assert.match(bad("cliquer sur Se déconnecter"), /pas le droit/);
  assert.match(bad("cliquer sur Payer maintenant"), /pas le droit/);
  assert.match(bad("remplir Mot de passe avec abc"), /sensible/);
  assert.match(bad("remplir Numéro de carte avec 4242"), /sensible/);
  assert.match(bad("remplir Montant avec"), /geste non compris|manque/);
  assert.match(bad(Array.from({ length: 21 }, () => "attendre 1").join("\n")), /20 gestes au plus/);
  assert.match(bad("x".repeat(5000)), /trop long/);
  // Prudence maximale : tout bouton qui parle de retrait est refusé, même un simple lien de menu (pour voir cette page : « aller à /retraits »).
  assert.match(bad("cliquer sur Historique des retraits"), /pas le droit/);
  assert.equal(bad("aller à /retraits"), "OK");
  assert.equal(bad("cliquer sur Paiements"), "OK"); // un nom de menu n'est pas l'action de payer
});

test("scénario : relu depuis la base, un geste dangereux ou mal formé est écarté", () => {
  const steps = sanitizeSteps([
    { a: "goto", t: "/app" }, { a: "click", t: "Supprimer" }, { a: "fill", t: "Mot de passe", v: "x" }, { a: "fill", t: "Montant", v: "5" },
    { a: "danse", t: "x" }, { a: "see", t: "" }, null, 12, { a: "click", t: "Créer un lien" },
  ]);
  assert.deepEqual(steps, [{ a: "goto", t: "/app" }, { a: "fill", t: "Montant", v: "5" }, { a: "click", t: "Créer un lien" }]);
  assert.deepEqual(sanitizeSteps("pas un tableau"), []);
});

test("robot : les règles de sécurité de l'exécuteur sont identiques à celles du serveur", () => {
  assert.equal(robotRules.FORBIDDEN.source, ROBOT_FORBIDDEN.source);
  assert.equal(robotRules.FORBIDDEN.flags, ROBOT_FORBIDDEN.flags);
  assert.ok(robotRules.SECRET_FIELD.test("Mot de passe"));
});

test("coffre : chiffrement AES-256-GCM, rien d'illisible modifiable, inutilisable sans la bonne clé", () => {
  const saved = process.env.ROBOT_ENC_KEY;
  try {
    delete process.env.ROBOT_ENC_KEY;
    assert.equal(vaultReady(), false);
    assert.throws(() => encryptSecret("x"));
    process.env.ROBOT_ENC_KEY = "a".repeat(64);
    assert.equal(vaultReady(), true);
    const blob = encryptSecret("Mot de passe de test é€!");
    assert.ok(!blob.includes("Mot de passe"));
    assert.equal(decryptSecret(blob), "Mot de passe de test é€!");
    assert.notEqual(encryptSecret("x"), encryptSecret("x")); // vecteur d'initialisation différent à chaque fois
    const parts = blob.split(".");
    parts[3] = Buffer.from("autre chose").toString("base64");
    assert.throws(() => decryptSecret(parts.join("."))); // contenu modifié : refusé
    assert.throws(() => decryptSecret("n'importe quoi"));
    process.env.ROBOT_ENC_KEY = "b".repeat(64);
    assert.throws(() => decryptSecret(blob)); // mauvaise clé : illisible
    process.env.ROBOT_ENC_KEY = "trop court";
    assert.equal(vaultReady(), false);
  } finally {
    if (saved === undefined) delete process.env.ROBOT_ENC_KEY;
    else process.env.ROBOT_ENC_KEY = saved;
  }
});

test("vigilance : contrôle chaque minute, sinon l'intervalle choisi", () => {
  assert.equal(effectiveInterval({ intervalMin: 30, vigilance: true }), 1);
  assert.equal(effectiveInterval({ intervalMin: 30 }), 30);
  assert.equal(effectiveInterval({ intervalMin: 30, vigilance: false }), 30);
  assert.equal(effectiveInterval({ intervalMin: 7 }), 5);
  assert.equal(effectiveInterval({ vigilance: "oui" }), 5); // seul « vrai » active le mode
});

test("vigilance : rappel dû après 30 minutes seulement (tolérance 30 s)", () => {
  const now = 5_000_000_000;
  assert.equal(reminderDue(null, now), false);
  assert.equal(reminderDue(now - 10 * 60_000, now), false);
  assert.equal(reminderDue(now - 29 * 60_000, now), false);
  assert.equal(reminderDue(now - 30 * 60_000, now), true);
  assert.equal(reminderDue(now - 29.6 * 60_000, now), true);
  assert.equal(reminderDue(now - 3 * 3600_000, now), true);
});


test("diagnostic : chaque problème a une cause en français simple et des étapes pour le régler", () => {
  assert.equal(diagnose(null), null);
  assert.equal(diagnose("   "), null);
  const cause = (reason: string, kind = "down") => diagnose(reason, kind)?.cause ?? "";
  const d402 = diagnose("Réponse HTTP 402");
  assert.match(d402?.cause ?? "", /Paiement requis/);
  assert.ok((d402?.steps.length ?? 0) >= 3);
  assert.match(d402?.steps.join(" ") ?? "", /Vercel|hébergeur/);
  assert.match(cause("Réponse HTTP 401"), /accès est refusé/);
  assert.match(cause("Réponse HTTP 403"), /accès est refusé/);
  assert.match(cause("Réponse HTTP 404"), /n'existe plus/);
  assert.match(cause("Réponse HTTP 404 (attendu : 200)"), /n'existe plus/);
  assert.match(cause("Réponse HTTP 429"), /trop de requêtes/);
  assert.match(cause("Réponse HTTP 500"), /erreur interne/);
  assert.match(cause("Réponse HTTP 502"), /502 ou 504/);
  assert.match(cause("Réponse HTTP 504"), /502 ou 504/);
  assert.match(cause("Réponse HTTP 503"), /indisponible/);
  assert.match(cause("Réponse HTTP 599"), /5xx/);
  assert.match(cause("Réponse HTTP 418"), /4xx/);
  assert.match(cause("Délai dépassé (10 s)"), /plus de 10 secondes/);
  assert.match(cause("Adresse introuvable (DNS)"), /nom de domaine/);
  assert.match(cause("Site injoignable"), /connexion/);
  assert.match(cause("Pas de réponse"), /connexion/);
  assert.match(cause("Trop de redirections"), /boucle/);
  assert.match(cause("Adresse non autorisée"), /réseau privé/);
  assert.match(cause("Texte attendu introuvable : « Connexion »"), /texte que tu as demandé/);
  assert.match(cause("Lent : 4,2 s (limite 3 s)"), /plus lentement/);
  assert.match(cause("Le certificat SSL a expiré"), /a expiré/);
  assert.match(cause("Certificat SSL invalide (non reconnu ou ne correspondant pas au site)"), /pas reconnu/);
  assert.match(cause("Le certificat SSL expire dans 12 jours"), /va bientôt expirer/);
  // Fonctionnalité ou page : « Nom : Réponse HTTP 404 » est compris aussi.
  assert.match(cause("Paiement : Réponse HTTP 500"), /erreur interne/);
  // Robot : ses messages passent avant les codes HTTP.
  assert.match(cause("Connexion impossible : connexion refusée : « Firebase: Error (auth/invalid-credential). »", "robot"), /compte de test/);
  assert.match(cause("Connexion impossible : Aucun champ mot de passe sur la page de connexion.", "robot"), /formulaire de connexion/);
  assert.match(cause("scénario en échec à « voir « Lien créé » » (introuvable (délai dépassé))", "robot"), /geste de ton scénario/);
  assert.match(cause("2 pages de l'application en erreur : /app (HTTP 500), /x (Délai dépassé)", "robot"), /pages de l'application/);
  assert.match(cause("1 page de l'application en erreur : /app (POST /api/x répond 500)", "robot"), /appels qu'elle fait/); // la cause la plus précise passe avant la phrase générale
  assert.match(cause("POST /api/x répond 500", "robot"), /appels qu'elle fait/);
  assert.match(cause("Redirigé vers la connexion (session perdue)", "robot"), /session/);
  // Message inconnu : une piste générale plutôt que rien.
  const unknown = diagnose("Quelque chose d'étrange");
  assert.match(unknown?.cause ?? "", /sans cause précise/);
  assert.ok((unknown?.steps.length ?? 0) >= 2);
});
