// Règles de sécurité du robot, partagées avec le serveur (src/lib/monitoring.ts : un test vérifie que les deux copies sont identiques).
// Actions irréversibles ou financières : le robot ne clique JAMAIS dessus, quel que soit le texte écrit dans un scénario.
export const FORBIDDEN = /supprim|delet|remov|effac|retirer|retrait|withdraw|\bpayer\b|pay now|virement|transf[eé]r|envoyer (l'|de l'|un |le |des )?(argent|paiement|virement|fonds)|confirmer|r[eé]silier|annuler|d[eé]connect|d[eé]connex|quitter|fermer la session|log ?out|sign ?out|d[eé]sactiver|r[eé]initialiser|\breset\b/i;
// Champs où le robot ne saisit jamais de valeur.
export const SECRET_FIELD = /mot de passe|password|\bpin\b|cvv|iban|secret|carte|\botp\b|code de v[eé]rification|code sms/i;
