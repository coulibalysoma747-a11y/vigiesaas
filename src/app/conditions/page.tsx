import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Conditions d'utilisation — Vigie SaaS", description: "Les règles d'utilisation de Vigie SaaS : surveillance de sites, robot de connexion et brocante." };

export default function Conditions() {
  return (
    <LegalPage
      title="Conditions d'utilisation"
      updated="31 octobre 2026"
      intro="En utilisant Vigie SaaS, tu acceptes ces règles. Elles sont courtes : le service est gratuit et en évolution."
      sections={[
        {
          title: "Le service",
          text: ["Vigie SaaS vérifie régulièrement des sites, t'alerte par e-mail en cas de problème, peut tester l'intérieur d'une application avec un compte de test, et propose une brocante de projets abandonnés."],
        },
        {
          title: "Ce que tu peux surveiller",
          text: [
            "Seulement des sites qui t'appartiennent ou pour lesquels tu as une autorisation. Il est interdit de surveiller le site d'un tiers sans son accord, d'utiliser Vigie pour surcharger un site, ou de viser des adresses internes ou privées (elles sont refusées).",
            "Le robot de connexion ne doit être utilisé qu'avec un compte de test que tu es autorisé à utiliser.",
          ],
        },
        {
          title: "Limites et qualité de service",
          text: [
            "Des limites s'appliquent (nombre de sites, de fonctionnalités, de robots, de pages testées). Les contrôles et les alertes sont faits au mieux : un retard ou une alerte manquée est possible (panne d'un prestataire, e-mail classé en courrier indésirable, retard des déclencheurs).",
            "Vigie SaaS est un outil d'aide : ne compte pas dessus comme seule protection pour un service vital.",
          ],
        },
        {
          title: "Brocante",
          text: ["Tu es responsable de ce que tu publies. Les annonces doivent être exactes et légales, sans contenu trompeur, offensant ou portant atteinte aux droits d'autrui. Une annonce contraire à ces règles peut être retirée. Vigie SaaS n'intervient pas dans les accords entre vendeur et acheteur."],
        },
        {
          title: "Responsabilité",
          text: ["Le service est fourni « tel quel », sans garantie. Dans la mesure permise par la loi, Vigie SaaS n'est pas responsable des pertes liées à une panne non détectée, à une alerte tardive ou à l'indisponibilité du service."],
        },
        {
          title: "Suspension et changements",
          text: ["Un compte qui ne respecte pas ces règles peut être suspendu. Ces conditions peuvent évoluer : la date de mise à jour ci-dessus fait foi, et continuer à utiliser le service vaut acceptation de la nouvelle version."],
        },
      ]}
    />
  );
}
