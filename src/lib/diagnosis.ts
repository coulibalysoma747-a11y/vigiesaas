// Diagnostic : traduit le message technique d'un problème (HTTP 402, délai dépassé, certificat…) en cause simple et en étapes pour le régler.
// Fonction pure, sans dépendance : utilisée par les pages, la liste des incidents et les e-mails d'alerte.

export type Diagnosis = { cause: string; steps: string[] };

type Rule = { test: RegExp; cause: string; steps: string[] };

const FOLLOW = "Dès que le problème est réglé, Vigie le détecte toute seule et t'envoie un e-mail de retour à la normale.";

/** Problèmes vus par le robot de connexion (testés en premier pour un incident « robot »). */
const ROBOT_RULES: Rule[] = [
  {
    test: /invalid-credential|identifiants? (incorrect|invalide)|mot de passe (incorrect|invalide)|wrong-password|user-not-found|connexion refus/i,
    cause: "Le compte de test n'arrive pas à se connecter : l'identifiant ou le mot de passe enregistré dans Vigie ne correspond plus à un compte existant.",
    steps: [
      "Essaie de te connecter toi-même à l'application avec l'identifiant et le mot de passe du compte de test.",
      "S'il ne marche pas : recrée le compte de test dans l'application, ou remets son mot de passe.",
      "Ouvre la carte « Robot de connexion » de ce site dans Vigie, saisis le bon mot de passe, puis enregistre.",
      "Si ton application se connecte seulement avec Google ou un code reçu par message, le robot ne peut pas l'utiliser : il lui faut un compte avec e-mail et mot de passe.",
    ],
  },
  {
    test: /aucun champ (mot de passe|identifiant)/i,
    cause: "Le robot ne trouve pas le formulaire de connexion sur la page indiquée.",
    steps: ["Ouvre cette page toi-même : le formulaire (e-mail et mot de passe) doit être visible.", "Vérifie l'adresse de la « page de connexion » dans la carte « Robot de connexion » et corrige-la si l'adresse a changé."],
  },
  {
    test: /sc[ée]nario en [ée]chec/i,
    cause: "Un geste de ton scénario n'a pas pu être fait : le bouton, le champ ou le texte attendu n'apparaît plus, ou la page a changé.",
    steps: [
      "Fais toi-même, à la main, le geste indiqué après « scénario en échec » dans l'application.",
      "Si le texte ou le bouton a été renommé volontairement : corrige la ligne du scénario dans la carte « Robot de connexion ».",
      "Si l'élément a disparu par erreur : c'est un vrai problème de ton application, à corriger puis à redéployer.",
    ],
  },
  {
    test: /session perdue|redirig[ée] vers la connexion/i,
    cause: "Après la connexion, l'application renvoie le robot vers la page de connexion : la session ne tient pas ou le compte n'a pas accès à cette page.",
    steps: ["Connecte-toi avec le compte de test et ouvre la page concernée : elle doit s'afficher sans te redemander de te connecter.", "Donne au compte de test les droits nécessaires, ou retire cette page de la visite."],
  },
  {
    test: /connexion impossible/i,
    cause: "Le robot n'a pas pu se connecter à l'application.",
    steps: ["Essaie de te connecter toi-même avec le compte de test.", "Vérifie les réglages de la carte « Robot de connexion » (page de connexion, identifiant, mot de passe)."],
  },
  {
    test: /(get|post|put|patch|delete) \S+ r[ée]pond 5\d\d/i,
    cause: "Une page s'affiche, mais l'un des appels qu'elle fait à ton serveur répond avec une erreur (code 5xx) : une fonction de l'application est cassée.",
    steps: ["Ouvre la page indiquée, avec le compte de test, et regarde la console du navigateur (touche F12, onglet Réseau).", "Regarde les journaux de ton serveur à l'heure du problème : l'appel en erreur y est visible.", "Corrige puis redéploie. Si ça a commencé après une mise en ligne, reviens à la version précédente."],
  },
  {
    test: /page.* de l'application en erreur/i,
    cause: "Une ou plusieurs pages de l'application répondent en erreur, ne répondent pas à temps, ou affichent une page d'erreur quand le compte de test est connecté.",
    steps: ["Ouvre les pages citées avec le compte de test et regarde ce qui s'affiche.", "Regarde les journaux de ton serveur à l'heure du problème.", "Corrige puis redéploie. Si ça a commencé après une mise en ligne, reviens à la version précédente."],
  },
];

const HTTP_RULES: Rule[] = [
  {
    test: /http 402|paiement requis|payment required/i,
    cause: "Ton hébergeur bloque le site et répond « Paiement requis » (code 402). Cela arrive quand le compte d'hébergement est suspendu, qu'une facture est impayée ou qu'une limite de l'offre gratuite est dépassée.",
    steps: [
      "Ouvre le tableau de bord de ton hébergeur (Vercel, Render, Netlify, etc.) et cherche un message de suspension, de facture impayée ou de quota dépassé.",
      "Regarde les e-mails de l'hébergeur : il prévient en général avant de bloquer un site.",
      "Règle la facture, ou passe le projet sur une offre gratuite, ou déplace le site chez un autre hébergeur.",
      FOLLOW,
    ],
  },
  {
    test: /http (401|403)\b|acc[èe]s refus/i,
    cause: "L'accès est refusé (code 401 ou 403) : la page demande une connexion ou un mot de passe, ou un pare-feu bloque les visites automatiques de Vigie.",
    steps: [
      "Ouvre l'adresse dans une fenêtre de navigation privée : si on te demande un mot de passe, la page n'est pas publique.",
      "Surveille plutôt une page publique de ton site (par exemple l'accueil), ou retire la protection de cette page.",
      "Si un pare-feu ou une protection anti-robots (Cloudflare, etc.) est actif, autorise les visites automatiques pour les contrôles.",
      FOLLOW,
    ],
  },
  {
    test: /http 404\b/i,
    cause: "La page n'existe plus à cette adresse (code 404) : elle a été supprimée, déplacée, ou l'adresse enregistrée dans Vigie est fausse.",
    steps: ["Ouvre l'adresse toi-même dans ton navigateur pour confirmer.", "Si la page a changé d'adresse : supprime ce site dans Vigie et ajoute-le avec la bonne adresse.", "Si elle a disparu par erreur : republie-la (souvent après un déploiement qui l'a retirée).", FOLLOW],
  },
  {
    test: /http 429\b/i,
    cause: "Ton site refuse parce qu'il reçoit « trop de requêtes » (code 429) : il limite les visites automatiques.",
    steps: ["Dans Vigie, choisis une fréquence de contrôle plus lente (par exemple 10 ou 30 minutes).", "Si tu as une protection anti-robots, autorise les contrôles de Vigie.", FOLLOW],
  },
  {
    test: /http (502|504)\b/i,
    cause: "Le serveur qui reçoit les visites n'obtient pas de réponse de ton application (code 502 ou 504) : l'application a planté, redémarre, ou met trop de temps à répondre.",
    steps: ["Regarde les journaux de ton application chez ton hébergeur : un plantage ou un manque de mémoire y est en général visible.", "Redémarre l'application depuis le tableau de bord de l'hébergeur.", "Si ça se répète, vérifie la mémoire utilisée et la vitesse de ta base de données.", FOLLOW],
  },
  {
    test: /http 503\b/i,
    cause: "Le service est indisponible (code 503) : surcharge, maintenance, quota dépassé, ou site gratuit qui est en train de se réveiller.",
    steps: ["Attends une à deux minutes et recharge le site : un hébergement gratuit qui se réveille répond au bout d'un moment.", "Regarde l'état de ton hébergeur et ses journaux (maintenance, quota, base de données arrêtée).", "Si c'est fréquent, passe sur une offre qui ne s'endort pas.", FOLLOW],
  },
  {
    test: /http 500\b/i,
    cause: "Ton application a rencontré une erreur interne (code 500) : il y a un bug côté serveur ou un service dont elle dépend est en panne (base de données, variable manquante).",
    steps: ["Regarde les journaux de ton application chez ton hébergeur, à l'heure indiquée : l'erreur exacte y est écrite.", "Si ça a commencé juste après une mise en ligne, reviens à la version précédente.", "Vérifie que la base de données répond et que les variables d'environnement sont bien présentes.", FOLLOW],
  },
  {
    test: /http 5\d\d\b/i,
    cause: "Le serveur du site signale une erreur de son côté (code 5xx).",
    steps: ["Regarde les journaux de ton application chez ton hébergeur.", "Vérifie l'état de l'hébergeur et de la base de données.", FOLLOW],
  },
  {
    test: /http 4\d\d\b/i,
    cause: "Le site refuse la demande de Vigie (code 4xx).",
    steps: ["Ouvre l'adresse toi-même dans ton navigateur pour voir ce qui s'affiche.", "Vérifie que l'adresse enregistrée dans Vigie est la bonne et qu'elle est publique.", FOLLOW],
  },
];

const GENERAL_RULES: Rule[] = [
  {
    test: /d[ée]lai d[ée]pass[ée]|timeout/i,
    cause: "Le site met plus de 10 secondes à répondre, ou ne répond pas du tout. C'est souvent un serveur surchargé, arrêté, ou un hébergement gratuit qui s'est endormi.",
    steps: ["Ouvre le site toi-même : s'il est très lent ou ne s'ouvre pas, le problème vient de ton serveur.", "Regarde chez ton hébergeur : serveur arrêté, mémoire pleine, base de données lente.", "Redémarre l'application. Si ça se répète, passe sur une offre plus puissante ou qui ne s'endort pas.", FOLLOW],
  },
  {
    test: /adresse introuvable|dns/i,
    cause: "Le nom de domaine du site n'est plus trouvé sur Internet : il a peut-être expiré, ou son réglage (DNS) est cassé ou mal écrit.",
    steps: ["Vérifie chez le vendeur de ton nom de domaine qu'il est bien renouvelé et actif.", "Vérifie les réglages DNS du domaine : ils doivent pointer vers ton hébergeur.", "Contrôle que l'adresse enregistrée dans Vigie est bien écrite.", FOLLOW],
  },
  {
    test: /site injoignable|pas de r[ée]ponse/i,
    cause: "Vigie n'arrive pas à établir la connexion avec le site : le serveur est éteint ou planté, un pare-feu bloque l'accès, ou le certificat de sécurité est en cause.",
    steps: ["Essaie d'ouvrir le site depuis ton téléphone, en 4G : s'il ne s'ouvre pas non plus, le site est vraiment en panne.", "Vérifie que le serveur est démarré chez l'hébergeur et regarde ses journaux.", "Vérifie le certificat SSL (le cadenas) et les règles de pare-feu.", FOLLOW],
  },
  {
    test: /trop de redirections/i,
    cause: "Le site renvoie les visiteurs d'une adresse à l'autre sans fin (boucle de redirection), souvent entre http et https, ou entre avec et sans « www ».",
    steps: ["Ouvre l'adresse dans ton navigateur : il affichera une erreur « trop de redirections ».", "Vérifie les réglages de redirection de ton hébergeur ou de ton domaine (https, www).", FOLLOW],
  },
  {
    test: /adresse non autoris[ée]e/i,
    cause: "L'adresse pointe vers un réseau privé ou interne : Vigie ne peut pas la surveiller depuis Internet.",
    steps: ["Utilise l'adresse publique du site (celle que tes visiteurs tapent), pas une adresse locale ou interne.", "Supprime ce site puis ajoute-le avec la bonne adresse."],
  },
  {
    test: /texte attendu introuvable/i,
    cause: "Le site répond, mais le texte que tu as demandé de retrouver n'apparaît plus sur la page : page vide, page d'erreur, ou texte modifié.",
    steps: ["Ouvre la page et cherche ce texte.", "Si la page affiche une erreur ou est vide : c'est une vraie panne, à corriger chez ton hébergeur ou dans ton application.", "Si tu as seulement changé le texte : corrige-le dans la section « Contrôles » du site, champ « Texte qui doit apparaître ».", FOLLOW],
  },
  {
    test: /^lent\b|\blent :/i,
    cause: "Le site répond, mais plus lentement que la limite que tu as fixée, plusieurs contrôles de suite.",
    steps: ["Teste la vitesse du site toi-même : si elle est mauvaise, regarde les images trop lourdes, les scripts, ou la lenteur de la base de données.", "Un hébergement gratuit est souvent lent : une offre supérieure règle le problème.", "Si la limite est trop sévère pour ton site, augmente-la dans la section « Contrôles »."],
  },
  {
    test: /\ba expir[ée](?![a-zà-ÿ])|\best expir[ée](?![a-zà-ÿ])/i,
    cause: "Le certificat de sécurité (le cadenas) du site a expiré : les navigateurs affichent un avertissement rouge et beaucoup de visiteurs partent.",
    steps: ["Renouvelle le certificat chez ton hébergeur ou le vendeur de ton domaine (souvent un bouton « renouveler » ou « forcer HTTPS »).", "Chez la plupart des hébergeurs modernes, il se renouvelle seul : vérifie que le domaine pointe bien vers eux.", FOLLOW],
  },
  {
    test: /certificat ssl invalide|certificat.*invalide/i,
    cause: "Le certificat de sécurité du site n'est pas reconnu ou ne correspond pas au nom du site : les navigateurs affichent un avertissement.",
    steps: ["Ouvre le site dans ton navigateur et regarde le message d'erreur du cadenas.", "Vérifie que le certificat couvre exactement le nom utilisé (avec ou sans « www »).", "Réémets le certificat chez ton hébergeur.", FOLLOW],
  },
  {
    test: /certificat ssl expire dans|expire dans \d+ jour/i,
    cause: "Le certificat de sécurité (le cadenas) du site va bientôt expirer. S'il expire, les visiteurs verront un avertissement de sécurité.",
    steps: ["Renouvelle le certificat chez ton hébergeur ou le vendeur de ton domaine avant la date limite.", "Chez la plupart des hébergeurs modernes, il se renouvelle seul : vérifie que le renouvellement automatique est actif.", FOLLOW],
  },
];

const FALLBACK: Diagnosis = {
  cause: "Vigie n'a pas obtenu de réponse normale du site, sans cause précise reconnue.",
  steps: ["Ouvre le site toi-même, dans ton navigateur, pour voir ce qui se passe.", "Regarde les journaux de ton application et l'état de ton hébergeur.", FOLLOW],
};

/**
 * Cause et étapes pour un message de problème. `kind` vaut « robot » pour un incident du robot de connexion
 * (ses messages sont testés d'abord). Renvoie null s'il n'y a pas de message.
 */
export function diagnose(reason: string | null | undefined, kind: string = "down"): Diagnosis | null {
  const text = (reason ?? "").trim();
  if (!text) return null;
  const lists = kind === "robot" ? [ROBOT_RULES, HTTP_RULES, GENERAL_RULES] : [HTTP_RULES, GENERAL_RULES, ROBOT_RULES];
  for (const list of lists) {
    const found = list.find((r) => r.test.test(text));
    if (found) return { cause: found.cause, steps: found.steps };
  }
  return FALLBACK;
}
