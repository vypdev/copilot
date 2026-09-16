import type { AgentConfiguration } from '../../domain/agent';
import {
  DEPLOYMENT_PHASES,
  type DeploymentPhase,
} from '../../domain/deployment_operation';
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
import {
  ENGLISH_MERGE_QUEUE_MESSAGES,
  MERGE_QUEUE_MESSAGE_IDS,
  SPANISH_MERGE_QUEUE_MESSAGES,
  type MergeQueueMessageId,
} from './merge_queue_message_catalog';
import {
  APPLICATION_ERROR_MESSAGE_IDS,
  ENGLISH_APPLICATION_ERROR_MESSAGES,
  SPANISH_APPLICATION_ERROR_MESSAGES,
  type ApplicationErrorMessageId,
} from './application_error_message_catalog';

const SIMPLE_MESSAGE_KEYS = Object.freeze([
  'release', 'hotfix', 'currentStatus', 'noAction', 'actionRequired', 'progress',
  'currentTransition', 'whatNext', 'links', 'technical', 'alreadyPublished',
  'notPublished', 'productionUpdated', 'developmentSynchronized', 'yes', 'no',
  'from', 'to', 'state', 'compare', 'controlCenter', 'purpose', 'afterMerge',
  'purposePromotion', 'promotionOverview',
  'reconciliationOverview', 'afterPromotion', 'noRepublish', 'origin',
  'preparedSource', 'destination', 'publication', 'productionFact',
  'developmentTarget', 'completionEffect', 'closeIssue', 'keepIssue',
  'readyBeforeReview', 'buildValidation', 'packageSmoke', 'protectedChecks',
  'syncReason', 'protectedFacts', 'cut', 'promotion', 'reconciliation', 'cleanup',
  'jobSummary', 'result', 'externalWait', 'workflowFailure', 'previousPhase',
  'resultingPhase', 'retryable', 'retryAfterCorrection', 'manualIntervention',
  'reviewManagedPr', 'fallback', 'operation', 'strategy', 'pullRequestMode',
  'sourceSha', 'productionSha', 'pending', 'publicationReceipt', 'absent',
  'localization', 'property', 'value', 'repositoryLocaleLabel',
  'issueLocaleLabel', 'pullRequestLocaleLabel', 'catalogResolution',
  'descriptors', 'reason',
] as const);

const DIAGRAM_KEYS = Object.freeze([
  'source', 'prepared', 'production', 'accepted', 'publication',
  'reconciliation', 'complete',
] as const);

const TEMPLATE_MESSAGE_IDS = Object.freeze([
  'deployment.template.promotionTitle',
  'deployment.template.reconciliationTitle',
  'deployment.template.promotionTechnical',
  'deployment.template.reconciliationTechnical',
  'deployment.template.jobState',
  'deployment.template.admissionScope',
  'deployment.template.sourceBranchLink',
  'deployment.template.originCommitLink',
  'deployment.template.preparedCommitLink',
  'deployment.template.promotionPullRequestLink',
  'deployment.template.reconciliationPullRequestLink',
  'deployment.template.productionCommitLink',
  'deployment.template.releaseLink',
  'deployment.template.actionTagLink',
  'deployment.template.npmLink',
  'deployment.template.workflowRunLink',
  'deployment.template.nextPromotion',
  'deployment.milestone.promotionMerged',
  'deployment.milestone.publicationComplete',
  'deployment.milestone.reconciliationBlocked',
  'deployment.milestone.complete',
] as const);

type SimpleMessageKey = typeof SIMPLE_MESSAGE_KEYS[number];
type DiagramKey = typeof DIAGRAM_KEYS[number];
type SimpleMessageId = `deployment.${SimpleMessageKey}`;
type PhaseMessageId = `deployment.phase.${DeploymentPhase}`;
type DiagramMessageId = `deployment.diagram.${DiagramKey}`;
type TemplateMessageId = typeof TEMPLATE_MESSAGE_IDS[number];

export type DeploymentMessageId =
  | SimpleMessageId
  | PhaseMessageId
  | DiagramMessageId
  | TemplateMessageId
  | MergeQueueMessageId
  | ApplicationErrorMessageId;
export type DeploymentMessageCatalog = ResolvedMessageCatalogView<DeploymentMessageId>;

export interface DeploymentCopy extends Readonly<Record<SimpleMessageKey, string>> {
  readonly phase: Readonly<Record<DeploymentPhase, string>>;
  readonly diagram: Readonly<Record<DiagramKey, string>>;
}

export const DEPLOYMENT_MESSAGE_IDS: readonly DeploymentMessageId[] = Object.freeze([
  ...SIMPLE_MESSAGE_KEYS.map(key => `deployment.${key}` as const),
  ...DEPLOYMENT_PHASES.map(phase => `deployment.phase.${phase}` as const),
  ...DIAGRAM_KEYS.map(key => `deployment.diagram.${key}` as const),
  ...TEMPLATE_MESSAGE_IDS,
  ...MERGE_QUEUE_MESSAGE_IDS,
  ...APPLICATION_ERROR_MESSAGE_IDS,
]);

const ENGLISH_SIMPLE: Readonly<Record<SimpleMessageKey, string>> = Object.freeze({
  release: 'Release', hotfix: 'Hotfix', currentStatus: 'Current status',
  noAction: 'No action is required while GitHub owns the pending transition.', actionRequired: 'Action required',
  progress: 'Progress', currentTransition: 'Current transition', whatNext: 'What happens next', links: 'Links',
  technical: 'Technical details', alreadyPublished: 'Package status: already published', notPublished: 'Package status: not published',
  productionUpdated: 'Production updated', developmentSynchronized: 'Development synchronized', yes: 'Yes', no: 'No',
  from: 'From', to: 'To', state: 'State', compare: 'Compare changes', controlCenter: 'Release control center',
  purpose: 'Purpose', afterMerge: 'After merge', purposePromotion: 'accept the prepared change in production',
  promotionOverview: 'Production promotion', reconciliationOverview: 'Development reconciliation',
  afterPromotion: 'After merge, Copilot will tag and publish the accepted production commit.',
  noRepublish: 'Merging or closing this PR cannot publish the package again.',
  origin: 'Origin', preparedSource: 'Prepared source', destination: 'Destination', publication: 'Publication',
  productionFact: 'Production fact', developmentTarget: 'Development target', completionEffect: 'Completion effect',
  closeIssue: 'Close issue after all targets', keepIssue: 'Keep issue open', readyBeforeReview: 'Ready before review',
  buildValidation: 'Build and release validation', packageSmoke: 'Package smoke test',
  protectedChecks: 'Protected-branch checks and reviews',
  syncReason: 'A dedicated sync branch preserves target-only commits and isolates target-dependent checks.',
  protectedFacts: 'What Copilot protected', cut: 'Source cut', promotion: 'Production promotion',
  reconciliation: 'Development reconciliation', cleanup: 'Cleanup and issue completion',
  jobSummary: 'Deployment orchestration', result: 'Result', externalWait: 'Waiting externally',
  workflowFailure: 'Workflow failed', previousPhase: 'Previous phase', resultingPhase: 'Resulting phase',
  retryable: 'Retryable', retryAfterCorrection: 'Retry after correcting the cause',
  manualIntervention: 'Manual intervention is required',
  reviewManagedPr: 'review and merge the managed PR when GitHub reports it ready',
  fallback: 'prepared -> production PR -> accepted -> published -> reconciled -> complete',
  operation: 'Operation', strategy: 'Strategy', pullRequestMode: 'PR mode', sourceSha: 'Source SHA',
  productionSha: 'Production SHA', pending: 'pending', publicationReceipt: 'Publication receipt', absent: 'absent',
  localization: 'Localization', property: 'Property', value: 'Value',
  repositoryLocaleLabel: 'Repository locale', issueLocaleLabel: 'Issue locale',
  pullRequestLocaleLabel: 'Pull-request locale', catalogResolution: 'Catalog resolution',
  descriptors: 'descriptors', reason: 'reason',
});

const SPANISH_SIMPLE: Readonly<Record<SimpleMessageKey, string>> = Object.freeze({
  release: 'Release', hotfix: 'Hotfix', currentStatus: 'Estado actual',
  noAction: 'No se requiere ninguna acción mientras GitHub gestiona la transición pendiente.', actionRequired: 'Acción necesaria',
  progress: 'Progreso', currentTransition: 'Transición actual', whatNext: 'Qué ocurrirá después', links: 'Enlaces',
  technical: 'Detalles técnicos', alreadyPublished: 'Estado del paquete: ya publicado', notPublished: 'Estado del paquete: no publicado',
  productionUpdated: 'Producción actualizada', developmentSynchronized: 'Desarrollo sincronizado', yes: 'Sí', no: 'No',
  from: 'Origen', to: 'Destino', state: 'Estado', compare: 'Comparar cambios', controlCenter: 'Centro de control de la release',
  purpose: 'Propósito', afterMerge: 'Después del merge', purposePromotion: 'aceptar en producción el cambio preparado',
  promotionOverview: 'Promoción a producción', reconciliationOverview: 'Reconciliación con desarrollo',
  afterPromotion: 'Tras el merge, Copilot etiquetará y publicará el commit aceptado en producción.',
  noRepublish: 'Mergear o cerrar esta PR no puede volver a publicar el paquete.',
  origin: 'Origen', preparedSource: 'Fuente preparada', destination: 'Destino', publication: 'Publicación',
  productionFact: 'Estado de producción', developmentTarget: 'Destino de desarrollo', completionEffect: 'Efecto al completar',
  closeIssue: 'Cerrar la issue tras todos los destinos', keepIssue: 'Mantener la issue abierta', readyBeforeReview: 'Listo antes de revisar',
  buildValidation: 'Build y validación de release', packageSmoke: 'Smoke test del paquete',
  protectedChecks: 'Checks y revisiones de la rama protegida',
  syncReason: 'Una rama de sincronización dedicada preserva los commits exclusivos del destino y aísla sus checks.',
  protectedFacts: 'Qué ha protegido Copilot', cut: 'Corte de la fuente', promotion: 'Promoción a producción',
  reconciliation: 'Reconciliación con desarrollo', cleanup: 'Limpieza y cierre de la issue',
  jobSummary: 'Orquestación del despliegue', result: 'Resultado', externalWait: 'Esperando fuera del workflow',
  workflowFailure: 'Workflow fallido', previousPhase: 'Fase anterior', resultingPhase: 'Fase resultante',
  retryable: 'Reintentable', retryAfterCorrection: 'Vuelve a intentarlo después de corregir la causa',
  manualIntervention: 'Se requiere intervención manual',
  reviewManagedPr: 'revisa y mergea la PR gestionada cuando GitHub indique que está lista',
  fallback: 'preparada -> PR de producción -> aceptada -> publicada -> reconciliada -> completada',
  operation: 'Operación', strategy: 'Estrategia', pullRequestMode: 'Modo de PR', sourceSha: 'SHA de origen',
  productionSha: 'SHA de producción', pending: 'pendiente', publicationReceipt: 'Recibo de publicación', absent: 'ausente',
  localization: 'Localización', property: 'Propiedad', value: 'Valor',
  repositoryLocaleLabel: 'Locale del repositorio', issueLocaleLabel: 'Locale de la issue',
  pullRequestLocaleLabel: 'Locale de la pull request', catalogResolution: 'Resolución del catálogo',
  descriptors: 'descriptores', reason: 'motivo',
});

const ENGLISH_PHASES: Readonly<Record<DeploymentPhase, string>> = Object.freeze({
  preparing: 'preparing the version', promotion_pr_pending: 'waiting for production approval',
  promoted: 'accepted in production', publishing: 'publishing artifacts',
  published: 'published; preparing development reconciliation',
  reconciliation_pending: 'waiting for development reconciliation', completed: 'completed', blocked: 'needs attention',
});

const SPANISH_PHASES: Readonly<Record<DeploymentPhase, string>> = Object.freeze({
  preparing: 'preparando la versión', promotion_pr_pending: 'esperando aprobación en producción',
  promoted: 'aceptada en producción', publishing: 'publicando artefactos',
  published: 'publicada; preparando la reconciliación',
  reconciliation_pending: 'esperando reconciliación con desarrollo', completed: 'completada', blocked: 'necesita atención',
});

const ENGLISH_DIAGRAM: Readonly<Record<DiagramKey, string>> = Object.freeze({
  source: 'Source snapshot', prepared: 'Version prepared', production: 'Production PR',
  accepted: 'Accepted in production', publication: 'Package and release',
  reconciliation: 'Development reconciliation', complete: 'Complete',
});

const SPANISH_DIAGRAM: Readonly<Record<DiagramKey, string>> = Object.freeze({
  source: 'Snapshot de origen', prepared: 'Versión preparada', production: 'PR de producción',
  accepted: 'Aceptada en producción', publication: 'Paquete y release',
  reconciliation: 'Reconciliación con desarrollo', complete: 'Completada',
});

const ENGLISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'deployment.template.promotionTitle': '{kind}({version}): promote to {branch}',
  'deployment.template.reconciliationTitle': '{kind}({version}): reconcile {source} into {target}',
  'deployment.template.promotionTechnical': 'Operation {operation}; strategy {strategy}; merge mode {mergeMode}.',
  'deployment.template.reconciliationTechnical': 'Operation {operation}; source SHA {sourceSha}.',
  'deployment.template.jobState': 'State: version {version}, revision {revision}',
  'deployment.template.admissionScope': 'Admission scope: repository + launcher issue #{issue}',
  'deployment.template.sourceBranchLink': '{branch} branch',
  'deployment.template.originCommitLink': '{commit} origin commit',
  'deployment.template.preparedCommitLink': '{commit} prepared commit',
  'deployment.template.promotionPullRequestLink': 'Promotion PR #{number}',
  'deployment.template.reconciliationPullRequestLink': 'Reconciliation PR #{number}',
  'deployment.template.productionCommitLink': '{commit} production commit',
  'deployment.template.releaseLink': '{tag} GitHub Release',
  'deployment.template.actionTagLink': '{tag} Action tag',
  'deployment.template.npmLink': '{package} version {version} on npm',
  'deployment.template.workflowRunLink': 'Workflow run',
  'deployment.template.nextPromotion': '{source} is prepared for promotion to {production}.',
  'deployment.milestone.promotionMerged': '✅ Promotion PR #{number} merged. Publication is starting from production SHA {productionSha}.',
  'deployment.milestone.publicationComplete': '📦 {tag} is published from accepted production SHA {productionSha}.',
  'deployment.milestone.reconciliationBlocked': '❌ Deployment blocked: {reason}',
  'deployment.milestone.complete': '✅ Deployment {tag} and every configured reconciliation target are complete.',
});

const SPANISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'deployment.template.promotionTitle': '{kind}({version}): promover a {branch}',
  'deployment.template.reconciliationTitle': '{kind}({version}): reconciliar {source} con {target}',
  'deployment.template.promotionTechnical': 'Operación {operation}; estrategia {strategy}; modo de merge {mergeMode}.',
  'deployment.template.reconciliationTechnical': 'Operación {operation}; SHA de origen {sourceSha}.',
  'deployment.template.jobState': 'Estado: versión {version}, revisión {revision}',
  'deployment.template.admissionScope': 'Ámbito de admisión: repositorio + issue de lanzamiento #{issue}',
  'deployment.template.sourceBranchLink': 'Rama {branch}',
  'deployment.template.originCommitLink': 'Commit de origen {commit}',
  'deployment.template.preparedCommitLink': 'Commit preparado {commit}',
  'deployment.template.promotionPullRequestLink': 'PR de promoción #{number}',
  'deployment.template.reconciliationPullRequestLink': 'PR de reconciliación #{number}',
  'deployment.template.productionCommitLink': 'Commit de producción {commit}',
  'deployment.template.releaseLink': 'Release de GitHub {tag}',
  'deployment.template.actionTagLink': 'Tag de Action {tag}',
  'deployment.template.npmLink': '{package}, versión {version}, en npm',
  'deployment.template.workflowRunLink': 'Ejecución del workflow',
  'deployment.template.nextPromotion': '{source} está preparada para promoverse a {production}.',
  'deployment.milestone.promotionMerged': '✅ La PR de promoción #{number} se ha mergeado. La publicación comienza desde el SHA de producción {productionSha}.',
  'deployment.milestone.publicationComplete': '📦 {tag} se ha publicado desde el SHA de producción aceptado {productionSha}.',
  'deployment.milestone.reconciliationBlocked': '❌ Despliegue bloqueado: {reason}',
  'deployment.milestone.complete': '✅ El despliegue {tag} y todos los destinos de reconciliación configurados se han completado.',
});

function catalogMessages(
  simple: Readonly<Record<SimpleMessageKey, string>>,
  phases: Readonly<Record<DeploymentPhase, string>>,
  diagram: Readonly<Record<DiagramKey, string>>,
  templates: Readonly<Record<TemplateMessageId, CatalogMessage>>,
  mergeQueue: Readonly<Record<MergeQueueMessageId, CatalogMessage>>,
  errorMessages: Readonly<Record<ApplicationErrorMessageId, CatalogMessage>>,
): Readonly<Record<DeploymentMessageId, CatalogMessage>> {
  return Object.freeze({
    ...Object.fromEntries(SIMPLE_MESSAGE_KEYS.map(key => [`deployment.${key}`, simple[key]])),
    ...Object.fromEntries(DEPLOYMENT_PHASES.map(phase => [`deployment.phase.${phase}`, phases[phase]])),
    ...Object.fromEntries(DIAGRAM_KEYS.map(key => [`deployment.diagram.${key}`, diagram[key]])),
    ...templates,
    ...mergeQueue,
    ...errorMessages,
  }) as Readonly<Record<DeploymentMessageId, CatalogMessage>>;
}

export const ENGLISH_DEPLOYMENT_DEFINITION: MessageCatalogDefinition<DeploymentMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: catalogMessages(
    ENGLISH_SIMPLE,
    ENGLISH_PHASES,
    ENGLISH_DIAGRAM,
    ENGLISH_TEMPLATES,
    ENGLISH_MERGE_QUEUE_MESSAGES,
    ENGLISH_APPLICATION_ERROR_MESSAGES,
  ),
});

export const SPANISH_DEPLOYMENT_DEFINITION: MessageCatalogDefinition<DeploymentMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: catalogMessages(
    SPANISH_SIMPLE,
    SPANISH_PHASES,
    SPANISH_DIAGRAM,
    SPANISH_TEMPLATES,
    SPANISH_MERGE_QUEUE_MESSAGES,
    SPANISH_APPLICATION_ERROR_MESSAGES,
  ),
});

export const DEPLOYMENT_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_DEPLOYMENT_DEFINITION,
  SPANISH_DEPLOYMENT_DEFINITION,
]);

export function resolveStaticDeploymentCatalog(locale: string): DeploymentMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_DEPLOYMENT_DEFINITION,
    DEPLOYMENT_CATALOG_DEFINITIONS,
  );
}

export function resolveDeploymentCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<DeploymentMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    DEPLOYMENT_MESSAGE_IDS,
    ENGLISH_DEPLOYMENT_DEFINITION,
    DEPLOYMENT_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}

export function deploymentCopy(catalog: DeploymentMessageCatalog): DeploymentCopy {
  return Object.freeze({
    ...Object.fromEntries(SIMPLE_MESSAGE_KEYS.map(key => [key, catalog.message(`deployment.${key}`)])),
    phase: Object.freeze(Object.fromEntries(
      DEPLOYMENT_PHASES.map(phase => [phase, catalog.message(`deployment.phase.${phase}`)]),
    )) as Readonly<Record<DeploymentPhase, string>>,
    diagram: Object.freeze(Object.fromEntries(
      DIAGRAM_KEYS.map(key => [key, catalog.message(`deployment.diagram.${key}`)]),
    )) as Readonly<Record<DiagramKey, string>>,
  }) as DeploymentCopy;
}
