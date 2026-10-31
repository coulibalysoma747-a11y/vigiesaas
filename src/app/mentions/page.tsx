import { LegalPage } from "@/components/LegalPage";

export default function Mentions() {
  return (
    <LegalPage
      title="Mentions légales"
      updated="31 octobre 2026"
      sections={[
        { title: "Le service", text: ["Vigie SaaS est un service de surveillance de sites et d'annuaire de projets SaaS abandonnés."] },
        { title: "Éditeur", text: ["À compléter : nom ou raison sociale, pays, adresse e-mail de contact."] },
        { title: "Hébergement", text: ["Render Services, Inc. — https://render.com. Données et connexion : Google Firebase. E-mails : Resend."] },
        { title: "Données personnelles", text: ["Le détail de ce qui est collecté, pourquoi, et tes droits figurent dans la politique de confidentialité. Pour toute demande (accès, correction, suppression du compte), écris à l'adresse de contact de l'éditeur ci-dessus."] },
      ]}
    />
  );
}
