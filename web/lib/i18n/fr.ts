/**
 * French strings.
 *
 * Typed as Dictionary, so this file cannot drift from en.ts without failing
 * the build - a missing key is a type error, not a page with an English word
 * in the middle of it.
 *
 * Quebec French, and the conventions that go with it: a narrow space before
 * the colon, "entreprise" rather than "business", and 24-hour times, which is
 * what formatTime produces under fr-CA anyway.
 */

import type { Dictionary } from "@/lib/i18n/en";

export const fr: Dictionary = {
  common: {
    brand: "JustDial CA",
    tagline: "Trouvez des entreprises locales partout au Canada",
    search: "Rechercher",
    searchPlaceholderWhat: "Plombiers, dentistes, restaurants…",
    searchPlaceholderWhere: "Ville ou code postal",
    nearMe: "Près de moi",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
    dashboard: "Tableau de bord",
    messages: "Messages",
    admin: "Administration",
    browse: "Parcourir",
    listYourBusiness: "Inscrire mon entreprise",
    loading: "Chargement…",
    retry: "Réessayer",
    cancel: "Annuler",
    close: "Fermer",
    openMenu: "Ouvrir le menu",
    language: "Langue",
  },
  listing: {
    showNumber: "Afficher le numéro",
    enquire: "Demander une soumission",
    call: "Appeler",
    directions: "Itinéraire",
    website: "Site Web",
    verified: "Vérifiée",
    verifiedHint: "Identité vérifiée par notre équipe",
    sponsored: "Commandité",
    open: "Ouvert",
    closed: "Fermé",
    closesAt: "Ferme à {time}",
    opensAt: "Ouvre à {time}",
    opensDay: "Ouvre {day} à {time}",
    noHours: "Heures non indiquées",
    noReviews: "Aucun avis",
    reviews: "{count} avis",
    oneReview: "1 avis",
    away: "à {distance}",
  },
  footer: {
    forCustomers: "Pour les clients",
    forBusinesses: "Pour les entreprises",
    company: "L'entreprise",
    browseCategories: "Parcourir les catégories",
    howItWorks: "Comment ça marche",
    addListing: "Inscrire une entreprise",
    pricing: "Tarifs",
    ownerSignIn: "Connexion entreprise",
    about: "À propos",
    privacy: "Confidentialité",
    terms: "Conditions",
    accessibility: "Accessibilité",
    rights: "Tous droits réservés.",
    madeIn: "Conçu au Canada. Prix en CAD.",
  },
  empty: {
    noResults: "Aucune entreprise ne correspond",
    noResultsBody: "Essayez une recherche plus large ou retirez un filtre.",
    clearFilters: "Effacer les filtres",
  },
};
