/**
 * Textes du site public, en français et en anglais.
 * Règle : chaque affirmation correspond à une fonctionnalité réellement disponible dans la plateforme.
 * Aucun chiffre de performance, logo client ou témoignage n'est affiché tant qu'il n'est pas vérifiable.
 */
export type Langue = "fr" | "en";

export const CONTENU = {
  fr: {
    nav: { plateforme: "Plateforme", parcours: "Parcours", direction: "Direction", securite: "Sécurité", offres: "Offres", connexion: "Se connecter", demo: "Demander une démo" },
    hero: {
      surtitre: "Le système d'exploitation des entreprises de transit",
      titre: "Chaque dossier, chaque délai, chaque décision —",
      titreAccent: "sous contrôle.",
      texte: "Dossiers, parcours douanier, sorties de conteneurs, facturation et relation client réunis dans un seul système. Vos équipes savent quoi faire. Votre direction sait où agir.",
      ctaPrincipal: "Demander une démo",
      ctaSecondaire: "Créer l'espace de mon entreprise",
      mention: "Essai de 14 jours · Sans installation · Ordinateur, tablette et mobile",
    },
    apercu: {
      etiquette: "Aperçu de l'interface — données d'exemple",
      dossier: "Dossier", client: "Client", etape: "Étape en cours", prochaine: "Prochaine action", responsable: "Responsable", echeance: "Échéance",
      valeurEtape: "Validation de la déclaration", valeurProchaine: "Joindre la liquidation douanière", valeurEcheance: "Aujourd'hui, 16 h",
      etapes: ["Réception", "Codage", "Validation", "Paiement", "Compagnie", "Sortie"],
      alerte: "Un document attendu manque pour clôturer l'étape",
    },
    principes: [
      { titre: "Isolation par entreprise", texte: "Vos données ne sont visibles que par votre organisation, contrôle appliqué par le serveur et par la base de données." },
      { titre: "Traçabilité", texte: "Changements d'étape, affectations et validations sont horodatés et attribués." },
      { titre: "Sauvegardes", texte: "Sauvegarde complète hebdomadaire, échecs signalés, restauration documentée." },
      { titre: "Rôles précis", texte: "Chaque profil n'accède qu'aux modules et aux actions qui le concernent." },
    ],
    modules: {
      surtitre: "Une seule plateforme",
      titre: "Toute l'opération, sans changer d'outil",
      texte: "Les modules partagent le même dossier : une information saisie une fois sert partout, du premier document à l'encaissement.",
      liste: [
        { titre: "Dossiers & parcours", texte: "Chaque étape a un responsable, un délai et une preuve. Une étape ne se clôt pas tant que ses tâches ne sont pas validées." },
        { titre: "Déclarations & DI", texte: "Suivi des déclarations, soldes et mouvements, alerte avant l'épuisement d'un solde." },
        { titre: "Sorties & logistique", texte: "Conteneurs, gate-pass, détentions, interchanges, camions et chauffeurs." },
        { titre: "Finance & facturation", texte: "Factures, règlements, débours et comptabilité opérationnelle, dans la devise de votre choix." },
        { titre: "Relation client", texte: "Fiche client complète, historique des échanges et lien de suivi partagé avec vos clients." },
        { titre: "Pilotage & performance", texte: "Charge des équipes, délais par étape, dossiers à risque et actions prioritaires." },
      ],
    },
    parcours: {
      surtitre: "Le parcours, piloté de bout en bout",
      titre: "Vos équipes savent toujours quelle est la prochaine action",
      texte: "Les tâches s'enchaînent dans l'ordre, démarrent automatiquement et sont chronométrées. Un imprévu est déclaré avec son motif — et le client peut en être informé.",
      etapes: [
        { titre: "Réception", texte: "Documents reçus, dossier ouvert et attribué." },
        { titre: "Préparation", texte: "Codage, contrôle et validation de la déclaration." },
        { titre: "Dédouanement", texte: "Liquidation, paiement des droits et taxes." },
        { titre: "Sortie", texte: "Bon compagnie, gate-pass, enlèvement et livraison." },
        { titre: "Clôture", texte: "Contrôle final, facturation et compte rendu." },
      ],
      note: "Le parcours est configurable : étapes, responsables et délais s'adaptent à vos sites et à vos procédures.",
    },
    direction: {
      surtitre: "Pour la direction",
      titre: "Comprendre l'état de l'entreprise en une minute",
      texte: "Un centre de pilotage calculé à partir de vos données réelles : dossiers actifs, retards, blocages, charge par collaborateur — sans saisie supplémentaire.",
      points: ["Urgences et dossiers menacés en tête", "Charge et délais par équipe", "Alertes de blocage remontées à la direction", "Comptes rendus PDF du parcours de chaque dossier"],
      etiquette: "Exemple d'affichage",
      kpis: [{ libelle: "Dossiers actifs" }, { libelle: "En retard" }, { libelle: "Bloqués" }, { libelle: "À valider aujourd'hui" }],
    },
    international: {
      surtitre: "Conçu pour plusieurs marchés",
      titre: "Vos règles, votre devise, votre fuseau",
      points: [
        { titre: "Multi-devises", texte: "FCFA, euro et dollar sur un même dossier, avec des taux de change définis par la direction." },
        { titre: "Fuseaux horaires", texte: "Chaque espace porte son pays, sa devise et son fuseau horaire." },
        { titre: "Procédures configurables", texte: "Aucune procédure douanière n'est imposée : étapes et documents se paramètrent." },
      ],
    },
    securite: {
      surtitre: "Sécurité & confiance",
      titre: "Vos dossiers restent les vôtres",
      liste: [
        "Isolation stricte entre entreprises, vérifiée côté serveur et garantie par la base de données",
        "Aucune autorisation déduite du navigateur : chaque requête est contrôlée",
        "Connexion sécurisée, sessions renouvelées et révocables",
        "Journal des actions sensibles et des connexions",
        "Sauvegardes hebdomadaires réservées à l'administration de la plateforme",
        "Lien de suivi client secret, désactivable à tout moment",
      ],
    },
    offres: {
      surtitre: "Offres",
      titre: "Une offre adaptée à la taille de votre équipe",
      texte: "Tarifs sur devis, selon le nombre d'utilisateurs et l'accompagnement souhaité.",
      surDevis: "Sur devis",
      utilisateurs: (n: number | null) => (n === null ? "Utilisateurs illimités" : `Jusqu'à ${n} utilisateurs`),
      recommande: "Essai gratuit",
      liste: [
        { cle: "starter", libelle: "Starter", texte: "Pour les petites équipes qui veulent structurer leurs dossiers.", points: ["Dossiers & parcours douanier", "Documents et tâches", "Lien de suivi client", "Notifications"] },
        { cle: "business", libelle: "Business", texte: "Pour les entreprises qui pilotent plusieurs équipes et sites.", points: ["Tout Starter", "Pilotage et supervision", "CRM et relation client", "Reporting et performance"] },
        { cle: "enterprise", libelle: "Enterprise", texte: "Pour les organisations aux exigences de contrôle élevées.", points: ["Tout Business", "Comptabilité SYSCOHADA", "Configurations spécifiques", "Accompagnement dédié"] },
      ],
      ctaEssai: "Démarrer l'essai",
      ctaContact: "Nous contacter",
    },
    faq: {
      titre: "Questions fréquentes",
      liste: [
        { q: "Comment mes collaborateurs retrouvent-ils notre espace ?", r: "Avec leur adresse email : elle est rattachée à votre entreprise. Ils se connectent sur la même page et arrivent directement dans votre espace." },
        { q: "Mes données sont-elles séparées de celles des autres entreprises ?", r: "Oui. Chaque enregistrement appartient à une seule organisation ; le serveur et la base de données refusent toute lecture ou référence croisée." },
        { q: "Faut-il installer un logiciel ?", r: "Non. La plateforme fonctionne dans le navigateur, sur ordinateur, tablette et téléphone, et peut être ajoutée à l'écran d'accueil." },
        { q: "Que se passe-t-il à la fin de l'essai ?", r: "L'accès est suspendu jusqu'à l'activation de votre abonnement. Vos données ne sont pas supprimées." },
      ],
    },
    demo: {
      surtitre: "Démonstration",
      titre: "Voyons ensemble vos opérations",
      texte: "Laissez vos coordonnées : nous revenons vers vous pour une démonstration adaptée à vos sites, vos volumes et vos procédures.",
      champs: { nom: "Nom complet", entreprise: "Entreprise", email: "Email professionnel", telephone: "Téléphone", pays: "Pays", taille: "Taille de l'équipe", message: "Votre besoin (facultatif)" },
      tailles: [{ v: "1-10", l: "1 à 10 personnes" }, { v: "11-50", l: "11 à 50 personnes" }, { v: "51-200", l: "51 à 200 personnes" }, { v: "200+", l: "Plus de 200 personnes" }],
      choisir: "Choisir",
      envoyer: "Envoyer la demande",
      envoi: "Envoi…",
      succesTitre: "Demande enregistrée",
      succesTexte: "Merci. Votre demande a bien été reçue ; nous vous recontactons rapidement.",
      erreurReseau: "La demande n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.",
      mentions: "Vos coordonnées servent uniquement à vous recontacter au sujet de votre demande.",
    },
    pied: { tagline: "Le système d'exploitation des entreprises de transit et de commission en douane.", droits: "Tous droits réservés.", connexion: "Connexion", creer: "Créer un espace" },
  },
  en: {
    nav: { plateforme: "Platform", parcours: "Workflow", direction: "Leadership", securite: "Security", offres: "Plans", connexion: "Sign in", demo: "Request a demo" },
    hero: {
      surtitre: "The operating system for freight forwarders and customs brokers",
      titre: "Every file, every deadline, every decision —",
      titreAccent: "under control.",
      texte: "Files, customs workflow, container releases, invoicing and client relations in one system. Your teams know what to do next. Your leadership knows where to act.",
      ctaPrincipal: "Request a demo",
      ctaSecondaire: "Create my company workspace",
      mention: "14-day trial · Nothing to install · Desktop, tablet and mobile",
    },
    apercu: {
      etiquette: "Interface preview — sample data",
      dossier: "File", client: "Client", etape: "Current stage", prochaine: "Next action", responsable: "Owner", echeance: "Due",
      valeurEtape: "Declaration validation", valeurProchaine: "Attach the customs assessment", valeurEcheance: "Today, 4 pm",
      etapes: ["Intake", "Coding", "Validation", "Payment", "Carrier", "Exit"],
      alerte: "An expected document is missing to close this stage",
    },
    principes: [
      { titre: "Per-company isolation", texte: "Your data is visible to your organisation only, enforced by the server and by the database." },
      { titre: "Traceability", texte: "Stage changes, assignments and approvals are time-stamped and attributed." },
      { titre: "Backups", texte: "Weekly full backup, failures reported, documented restore." },
      { titre: "Precise roles", texte: "Each profile only reaches the modules and actions it needs." },
    ],
    modules: {
      surtitre: "One platform",
      titre: "Your entire operation, without switching tools",
      texte: "Every module shares the same file: information entered once is used everywhere, from the first document to payment.",
      liste: [
        { titre: "Files & workflow", texte: "Each stage has an owner, a deadline and evidence. A stage cannot close until its tasks are approved." },
        { titre: "Declarations & import permits", texte: "Declarations, balances and movements tracked, with an alert before a balance runs out." },
        { titre: "Releases & logistics", texte: "Containers, gate passes, detention, interchanges, trucks and drivers." },
        { titre: "Finance & invoicing", texte: "Invoices, payments, disbursements and operational accounting in the currency you choose." },
        { titre: "Client relations", texte: "Full client record, communication history and a tracking link shared with your clients." },
        { titre: "Steering & performance", texte: "Team workload, time per stage, files at risk and priority actions." },
      ],
    },
    parcours: {
      surtitre: "End-to-end workflow",
      titre: "Your teams always know the next action",
      texte: "Tasks run in order, start automatically and are timed. An unexpected event is logged with its reason — and the client can be informed.",
      etapes: [
        { titre: "Intake", texte: "Documents received, file opened and assigned." },
        { titre: "Preparation", texte: "Coding, review and validation of the declaration." },
        { titre: "Clearance", texte: "Assessment, payment of duties and taxes." },
        { titre: "Release", texte: "Carrier release, gate pass, pickup and delivery." },
        { titre: "Closing", texte: "Final review, invoicing and file report." },
      ],
      note: "The workflow is configurable: stages, owners and deadlines adapt to your sites and procedures.",
    },
    direction: {
      surtitre: "For leadership",
      titre: "Understand the state of the business in one minute",
      texte: "A command center computed from your actual data: active files, delays, blockers, workload per person — with no extra data entry.",
      points: ["Urgent and threatened files first", "Workload and lead times per team", "Blockers escalated to leadership", "PDF report of each file's full workflow"],
      etiquette: "Sample display",
      kpis: [{ libelle: "Active files" }, { libelle: "Late" }, { libelle: "Blocked" }, { libelle: "To approve today" }],
    },
    international: {
      surtitre: "Built for multiple markets",
      titre: "Your rules, your currency, your time zone",
      points: [
        { titre: "Multi-currency", texte: "CFA franc, euro and dollar on the same file, with exchange rates set by leadership." },
        { titre: "Time zones", texte: "Each workspace carries its country, currency and time zone." },
        { titre: "Configurable procedures", texte: "No customs procedure is imposed: stages and documents are configurable." },
      ],
    },
    securite: {
      surtitre: "Security & trust",
      titre: "Your files stay yours",
      liste: [
        "Strict isolation between companies, checked by the server and enforced by the database",
        "No permission is ever inferred from the browser: every request is checked",
        "Secure sign-in, renewable and revocable sessions",
        "Log of sensitive actions and sign-ins",
        "Weekly backups restricted to platform administration",
        "Secret client tracking link, revocable at any time",
      ],
    },
    offres: {
      surtitre: "Plans",
      titre: "A plan that fits the size of your team",
      texte: "Pricing on request, based on the number of users and the support you need.",
      surDevis: "On request",
      utilisateurs: (n: number | null) => (n === null ? "Unlimited users" : `Up to ${n} users`),
      recommande: "Free trial",
      liste: [
        { cle: "starter", libelle: "Starter", texte: "For small teams structuring their files.", points: ["Files & customs workflow", "Documents and tasks", "Client tracking link", "Notifications"] },
        { cle: "business", libelle: "Business", texte: "For companies running several teams and sites.", points: ["Everything in Starter", "Steering and supervision", "CRM and client relations", "Reporting and performance"] },
        { cle: "enterprise", libelle: "Enterprise", texte: "For organisations with high control requirements.", points: ["Everything in Business", "SYSCOHADA accounting", "Specific configurations", "Dedicated support"] },
      ],
      ctaEssai: "Start the trial",
      ctaContact: "Contact us",
    },
    faq: {
      titre: "Frequently asked questions",
      liste: [
        { q: "How do my colleagues find our workspace?", r: "With their email address: it is linked to your company. They sign in on the same page and land directly in your workspace." },
        { q: "Is my data separated from other companies?", r: "Yes. Every record belongs to a single organisation; the server and the database reject any cross-company read or reference." },
        { q: "Do I need to install anything?", r: "No. The platform runs in the browser on desktop, tablet and phone, and can be added to the home screen." },
        { q: "What happens at the end of the trial?", r: "Access is suspended until your subscription is activated. Your data is not deleted." },
      ],
    },
    demo: {
      surtitre: "Demo",
      titre: "Let's look at your operations together",
      texte: "Leave your details: we will get back to you with a demo tailored to your sites, volumes and procedures.",
      champs: { nom: "Full name", entreprise: "Company", email: "Work email", telephone: "Phone", pays: "Country", taille: "Team size", message: "Your needs (optional)" },
      tailles: [{ v: "1-10", l: "1 to 10 people" }, { v: "11-50", l: "11 to 50 people" }, { v: "51-200", l: "51 to 200 people" }, { v: "200+", l: "More than 200 people" }],
      choisir: "Select",
      envoyer: "Send request",
      envoi: "Sending…",
      succesTitre: "Request received",
      succesTexte: "Thank you. Your request has been recorded; we will be in touch shortly.",
      erreurReseau: "The request could not be sent. Check your connection and try again.",
      mentions: "Your details are only used to contact you about your request.",
    },
    pied: { tagline: "The operating system for freight forwarders and customs brokers.", droits: "All rights reserved.", connexion: "Sign in", creer: "Create a workspace" },
  },
} as const;

export type Contenu = (typeof CONTENU)[Langue];

const CLE_LANGUE = "tios_langue";

/** Langue préférée : choix mémorisé, sinon langue du navigateur (français par défaut). */
export function langueInitiale(): Langue {
  try {
    const memo = localStorage.getItem(CLE_LANGUE);
    if (memo === "fr" || memo === "en") return memo;
  } catch { /* stockage indisponible */ }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")) return "en";
  return "fr";
}

export function memoriserLangue(l: Langue) {
  try { localStorage.setItem(CLE_LANGUE, l); } catch { /* stockage indisponible */ }
}
