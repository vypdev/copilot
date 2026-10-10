import type { optionLabelsEs } from './es';

export const optionLabelsFr: Record<keyof typeof optionLabelsEs, string> = {
  All: 'Tous', prompt: 'Demander avant de créer le renvoi', 'create-if-missing': 'Créer le renvoi s’il manque', disabled: 'Désactivé',
  replace: 'Remplacer', append: 'Ajouter', preserve: 'Conserver',
  info: 'Information', low: 'Faible', medium: 'Moyenne', high: 'Élevée',
  smart: 'Adaptatif', default: 'Par défaut', auto: 'Automatique', always: 'Toujours réinstaller',
  recommend: 'Recommander une approbation', guarded: 'Approuver sous garde', off: 'Désactivé',
  check: 'Vérification CI imposant la couverture', numeric: 'Rapport numérique vérifiable',
  repository: 'Dépôt', organization: 'Organisation', selected: 'Dépôts sélectionnés', private: 'Dépôts privés', all: 'Tous les dépôts',
  'production-lineage': 'Préserver la filiation de production', 'canonical-gitflow': 'Git-Flow canonique', manual: 'Manuel',
  'auto-merge': 'Fusionner automatiquement', 'merge-queue': 'File de fusion', 'create-only': 'Créer la PR uniquement',
  direct: 'Fusion directe', 'sync-branch': 'Par branche de synchronisation', 'prefer-release': 'Privilégier la version', development: 'Développement', both: 'Les deux destinations',
  'source-only': 'Branche source seulement', 'sync-only': 'Branche de synchronisation seulement', none: 'Aucune',
  close: 'Fermer le ticket', 'keep-open': 'Garder ouvert', guided: 'Guidé', compact: 'Compact', quiet: 'Minimal',
  update: 'Mettre le commentaire à jour', milestones: 'Publier aux étapes clés',
  feature: 'Fonctionnalité', bugfix: 'Correction', documentation: 'Documentation', chore: 'Maintenance', help: 'Aide ou question', hotfix: 'Correctif urgent', release: 'Version',
};
