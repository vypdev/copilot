import type { AgentConfiguration } from '../../domain/agent';
import {
  MESSAGE_CATALOG_VERSION,
  type CatalogMessage,
  type MessageCatalogDefinition,
} from '../../domain/message_catalog';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import {
  resolveMessageCatalogView,
  resolveStaticMessageCatalogView,
  type ResolvedMessageCatalogView,
} from './resolved_message_catalog_policy';

export const BRANCH_SYNC_MESSAGE_IDS = Object.freeze([
  'branchSync.stale.heading',
  'branchSync.stale.behind',
  'branchSync.stale.ahead',
  'branchSync.stale.instructions',
  'branchSync.stale.compare',
  'branchSync.aligned.heading',
  'branchSync.aligned.status',
  'branchSync.aligned.resolved',
] as const);

export type BranchSyncMessageId = typeof BRANCH_SYNC_MESSAGE_IDS[number];
export type BranchSyncMessageCatalog = ResolvedMessageCatalogView<BranchSyncMessageId>;

const ENGLISH_MESSAGES: Readonly<Record<BranchSyncMessageId, CatalogMessage>> = Object.freeze({
  'branchSync.stale.heading': 'Action required: synchronize the branch',
  'branchSync.stale.behind': Object.freeze({
    one: '{workingBranch} is {count} commit behind its parent branch {parentBranch}.',
    other: '{workingBranch} is {count} commits behind its parent branch {parentBranch}.',
  }),
  'branchSync.stale.ahead': Object.freeze({
    one: 'It also contains {count} commit not present in the parent branch.',
    other: 'It also contains {count} commits not present in the parent branch.',
  }),
  'branchSync.stale.instructions': 'Run {command} in this conversation to merge the parent changes safely. If Git reports conflicts, the configured fixer agent can resolve eligible files before the verification commands run.',
  'branchSync.stale.compare': 'Compare parent and working branch',
  'branchSync.aligned.heading': 'Branch synchronized',
  'branchSync.aligned.status': '{workingBranch} now contains the current history of its parent branch {parentBranch}.',
  'branchSync.aligned.resolved': 'The previous synchronization recommendation has been resolved.',
});

const SPANISH_MESSAGES: Readonly<Record<BranchSyncMessageId, CatalogMessage>> = Object.freeze({
  'branchSync.stale.heading': 'Acción necesaria: sincroniza la rama',
  'branchSync.stale.behind': Object.freeze({
    one: '{workingBranch} está {count} commit por detrás de su rama padre {parentBranch}.',
    other: '{workingBranch} está {count} commits por detrás de su rama padre {parentBranch}.',
  }),
  'branchSync.stale.ahead': Object.freeze({
    one: 'También contiene {count} commit que no está en la rama padre.',
    other: 'También contiene {count} commits que no están en la rama padre.',
  }),
  'branchSync.stale.instructions': 'Ejecuta {command} en esta conversación para integrar de forma segura los cambios de la rama padre. Si Git detecta conflictos, el agente corrector configurado puede resolver los archivos permitidos antes de ejecutar las verificaciones.',
  'branchSync.stale.compare': 'Comparar la rama padre y la rama de trabajo',
  'branchSync.aligned.heading': 'Rama sincronizada',
  'branchSync.aligned.status': '{workingBranch} ya contiene el historial actual de su rama padre {parentBranch}.',
  'branchSync.aligned.resolved': 'La recomendación de sincronización anterior está resuelta.',
});

export const ENGLISH_BRANCH_SYNC_DEFINITION: MessageCatalogDefinition<BranchSyncMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: ENGLISH_MESSAGES,
});

export const SPANISH_BRANCH_SYNC_DEFINITION: MessageCatalogDefinition<BranchSyncMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: SPANISH_MESSAGES,
});

export const BRANCH_SYNC_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_BRANCH_SYNC_DEFINITION,
  SPANISH_BRANCH_SYNC_DEFINITION,
]);

export function resolveStaticBranchSyncCatalog(locale: string): BranchSyncMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_BRANCH_SYNC_DEFINITION,
    BRANCH_SYNC_CATALOG_DEFINITIONS,
  );
}

export async function resolveBranchSyncCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<BranchSyncMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    BRANCH_SYNC_MESSAGE_IDS,
    ENGLISH_BRANCH_SYNC_DEFINITION,
    BRANCH_SYNC_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}
