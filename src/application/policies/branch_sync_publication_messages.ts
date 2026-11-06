export const BRANCH_SYNC_PUBLICATION_LABEL_KEYS = ['syncRemoteUnchanged', 'syncRemoteChanged', 'syncRemoteUnverified', 'syncPushAttempted', 'syncPushNotAttempted'] as const;
export const ENGLISH_BRANCH_SYNC_PUBLICATION_LABELS = {
  syncRemoteUnchanged: 'The observed remote still points to the original head; the candidate was not observed as published.',
  syncRemoteChanged: 'The remote has a different head; this observation does not establish whether it includes the candidate.',
  syncRemoteUnverified: 'The remote head could not be established; publication remains unknown.',
  syncPushAttempted: 'A normal push was attempted.', syncPushNotAttempted: 'No push was attempted.',
};
export const SPANISH_BRANCH_SYNC_PUBLICATION_LABELS = {
  syncRemoteUnchanged: 'El remoto observado conserva el head original; no se observó la publicación del candidato.',
  syncRemoteChanged: 'El remoto tiene otro head; esta observación no determina si incluye el candidato.',
  syncRemoteUnverified: 'No se pudo establecer el head remoto; la publicación sigue sin verificarse.',
  syncPushAttempted: 'Se intentó un push normal.', syncPushNotAttempted: 'No se intentó ningún push.',
};
const retained = 'The local merge commit step finished; candidate identity: {candidateSha}. {pushStatus} {remoteStatus} Original head: {originalSha}; observed head: {observedSha}. Recovery did not reset or abort the committed workspace; runner-local storage is temporary.';
const retainedSpanish = 'Terminó el paso de commit del merge local; identidad del candidato: {candidateSha}. {pushStatus} {remoteStatus} Head original: {originalSha}; head observado: {observedSha}. La recuperación no restableció ni abortó el espacio de trabajo confirmado; el almacenamiento del runner es temporal.';
export const ENGLISH_BRANCH_SYNC_PUBLICATION_CONTENT = {
  'branch-sync-workflow-write-required': {
    impact: 'The remote rejected workflow-file publication by the configured publisher.',
    action: 'A maintainer must review the publisher credential and grant the appropriate workflow-write capability through its normal configuration, then rerun {syncCommand} from the current managed PR. Do not retry unchanged credentials or bypass the managed branch. Recovery guide: {publicationGuide}.',
    retainedState: retained,
  },
  'branch-sync-publication-failed': {
    impact: 'Branch synchronization did not reach a verified remote publication ({reason}).',
    action: 'Inspect the current native remote head and the retained candidate before a fresh Action-managed synchronization. An unavailable observation is not proof that nothing was published. Recovery guide: {publicationGuide}.',
    retainedState: retained,
  },
};
export const SPANISH_BRANCH_SYNC_PUBLICATION_CONTENT = {
  'branch-sync-workflow-write-required': {
    impact: 'El remoto rechazó la publicación de archivos de workflow mediante la credencial configurada.',
    action: 'Un mantenedor debe revisar la credencial y conceder la capacidad de escritura de workflows adecuada mediante su configuración habitual; después, debe ejecutar {syncCommand} desde la PR gestionada actual. No repitas la misma credencial ni eludas la rama gestionada. Guía: {publicationGuide}.',
    retainedState: retainedSpanish,
  },
  'branch-sync-publication-failed': {
    impact: 'La sincronización no alcanzó una publicación remota verificada ({reason}).',
    action: 'Inspecciona el head remoto nativo actual y el candidato conservado antes de una nueva sincronización gestionada por la Action. No disponer de una observación no demuestra que no se publicara nada. Guía: {publicationGuide}.',
    retainedState: retainedSpanish,
  },
};
