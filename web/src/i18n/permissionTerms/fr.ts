import type { PermissionName, PermissionTerm } from '../permissionTerms';
export const namesFr: Readonly<Record<PermissionName, string>> = {
  Metadata: 'Métadonnées', Contents: 'Contenu', Secrets: 'Secrets', Variables: 'Variables', Issues: 'Tickets', Actions: 'Actions', Checks: 'Vérifications', Administration: 'Administration', Workflows: 'Flux de travail', 'Issue Types': 'Types de ticket', Projects: 'Projets', 'Pull requests': 'Demandes de tirage', Members: 'Membres',
};
export const termsFr: Readonly<Record<PermissionTerm, string>> = {
  repository: 'dépôt', organization: 'organisation', read: 'Lecture', write: 'Écriture', required: 'Obligatoire', conditional: 'Conditionnel', verified: 'Vérifié', missing: 'Manquant', unverifiable: 'Non vérifiable',
};
