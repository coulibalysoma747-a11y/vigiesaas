import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Confidentialité — Vigie SaaS", description: "Les données que Vigie SaaS collecte, pourquoi, qui les traite et comment les supprimer." };

export default function Confidentialite() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updated="31 octobre 2026"
      intro="Vigie SaaS ne collecte que ce qui est nécessaire pour surveiller tes sites et te prévenir. Aucune publicité, aucune revente de données, aucune donnée bancaire."
      sections={[
        {
          title: "Ce que nous collectons",
          text: [
            "Ton compte : le nom et l'adresse e-mail de ton compte Google, reçus quand tu te connectes avec Google. Nous ne recevons jamais ton mot de passe Google.",
            "Tes sites surveillés : l'adresse de chaque site, son nom, tes réglages, et les résultats des contrôles (en ligne ou non, temps de réponse, certificat, pages testées). L'historique des contrôles est gardé 30 jours, les incidents jusqu'à ce que tu supprimes le site.",
            "Tes annonces de la brocante : le texte que tu publies est public.",
          ],
        },
        {
          title: "Le robot de connexion (facultatif)",
          text: [
            "Si tu l'actives, tu fournis l'identifiant et le mot de passe d'un compte de test de TON application. Le mot de passe est chiffré (AES-256-GCM) avant d'être enregistré, n'est jamais renvoyé à ton navigateur ni écrit dans des journaux, et ne sert qu'à se connecter à ton application pour tester des pages.",
            "Utilise un compte de test sans droits importants et sans vraies données. Tu peux le retirer à tout moment : le mot de passe est alors effacé.",
          ],
        },
        {
          title: "À quoi servent ces données",
          text: ["À contrôler tes sites, à t'envoyer des alertes (panne, retour en ligne, lenteur, certificat, pages, robot) à l'adresse e-mail de ton compte, et à faire fonctionner le service. Rien d'autre."],
        },
        {
          title: "Qui traite les données",
          text: [
            "Google (Firebase) : connexion et base de données. Render : hébergement du site. Resend : envoi des e-mails d'alerte. GitHub : déclencheurs automatiques et exécution du robot (les journaux GitHub de ce projet sont publics, mais ne contiennent ni mot de passe ni donnée personnelle).",
            "Ces prestataires peuvent stocker des données hors de ton pays. Nous ne vendons ni ne partageons tes données avec d'autres.",
          ],
        },
        {
          title: "Tes droits",
          text: [
            "Tu peux à tout moment : supprimer un site (son historique, ses incidents et son mot de passe de test sont effacés), retirer une annonce, couper les alertes dans les réglages.",
            "Pour accéder à tes données, les corriger ou faire supprimer ton compte, écris-nous à l'adresse indiquée dans les mentions légales.",
          ],
        },
        {
          title: "Cookies",
          text: ["Vigie SaaS n'utilise pas de cookies publicitaires ni de mesure d'audience. Seul le service de connexion de Google conserve ce qu'il faut pour te garder connecté."],
        },
      ]}
    />
  );
}
