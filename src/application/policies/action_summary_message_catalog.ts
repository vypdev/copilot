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
import {
  APPLICATION_ERROR_MESSAGE_IDS,
  ENGLISH_APPLICATION_ERROR_MESSAGES,
  SPANISH_APPLICATION_ERROR_MESSAGES,
  type ApplicationErrorMessageId,
} from './application_error_message_catalog';

const SIMPLE_MESSAGE_KEYS = Object.freeze([
  'heading', 'repository', 'property', 'value', 'status', 'event', 'target',
  'lifecycle', 'descriptionPolicy', 'results', 'findingStates', 'bugbotReview',
  'sourceFreshness', 'staleSourceSuppressed',
  'duplicateCleanup', 'actionNotifications', 'actionNotificationCreated',
  'actionNotificationReused',
  'resultDetails', 'localization', 'repositoryLocale', 'issueLocale',
  'pullRequestLocale', 'catalogResolution', 'descriptors', 'reason', 'failure',
  'findings', 'partial', 'superseded', 'skipped', 'dryRun', 'success', 'invalid',
  'none', 'resultSucceeded', 'resultFailed', 'resultSkipped',
  'evidenceActionableFindings', 'evidenceActionableFailures',
  'evidencePartialCoverage', 'evidenceSuperseded', 'evidenceSkipped',
  'evidenceNoActionableResult', 'evidenceCompleted',
] as const);

const TEMPLATE_MESSAGE_IDS = Object.freeze([
  'summary.target.pullRequest',
  'summary.target.issue',
  'summary.target.repositoryRun',
  'summary.bugbotTelemetry',
  'summary.duplicateCleanup.single',
  'summary.duplicateCleanup.multiple',
  'summary.duplicateCleanup.bounded',
  'summary.actionNotification.entry',
] as const);

const FINDING_STATE_KEYS = Object.freeze([
  'open', 'reopened', 'fixed', 'obsolete', 'dismissed',
  'verification-required', 'unknown',
] as const);

type SimpleMessageKey = typeof SIMPLE_MESSAGE_KEYS[number];
type SimpleMessageId = `summary.${SimpleMessageKey}`;
type TemplateMessageId = typeof TEMPLATE_MESSAGE_IDS[number];
export type ActionSummaryFindingState = typeof FINDING_STATE_KEYS[number];
type FindingStateMessageId = `summary.findingState.${ActionSummaryFindingState}`;

export type ActionSummaryMessageId =
  | SimpleMessageId
  | TemplateMessageId
  | FindingStateMessageId
  | ApplicationErrorMessageId;
export type ActionSummaryMessageCatalog = ResolvedMessageCatalogView<ActionSummaryMessageId>;

export const ACTION_SUMMARY_MESSAGE_IDS: readonly ActionSummaryMessageId[] = Object.freeze([
  ...SIMPLE_MESSAGE_KEYS.map(key => `summary.${key}` as const),
  ...TEMPLATE_MESSAGE_IDS,
  ...FINDING_STATE_KEYS.map(key => `summary.findingState.${key}` as const),
  ...APPLICATION_ERROR_MESSAGE_IDS,
]);

const ENGLISH_SIMPLE: Readonly<Record<SimpleMessageKey, string>> = Object.freeze({
  heading: 'Copilot execution',
  repository: 'Repository',
  property: 'Property',
  value: 'Value',
  status: 'Status',
  event: 'Event',
  target: 'Target',
  lifecycle: 'Lifecycle',
  descriptionPolicy: 'PR description policy',
  results: 'Results',
  findingStates: 'Finding states',
  bugbotReview: 'Bugbot review',
  sourceFreshness: 'Source freshness',
  staleSourceSuppressed: 'Stale result suppressed; branch HEAD changed during the run',
  duplicateCleanup: 'Duplicate cleanup',
  actionNotifications: 'Action notifications',
  actionNotificationCreated: 'created',
  actionNotificationReused: 'reused',
  resultDetails: 'Failure details',
  localization: 'Localization',
  repositoryLocale: 'Repository locale',
  issueLocale: 'Issue locale',
  pullRequestLocale: 'Pull-request locale',
  catalogResolution: 'Catalog resolution',
  descriptors: 'descriptors',
  reason: 'reason',
  failure: 'Failure',
  findings: 'Findings',
  partial: 'Partial',
  superseded: 'Superseded',
  skipped: 'Skipped',
  dryRun: 'Dry run',
  success: 'Success',
  invalid: 'invalid',
  none: 'none',
  resultSucceeded: 'Succeeded',
  resultFailed: 'Failed',
  resultSkipped: 'Skipped',
  evidenceActionableFindings: 'Copilot found actionable findings',
  evidenceActionableFailures: 'Copilot found actionable failures',
  evidencePartialCoverage: 'Copilot review has partial coverage',
  evidenceSuperseded: 'Copilot review was superseded',
  evidenceSkipped: 'Copilot review was skipped',
  evidenceNoActionableResult: 'Copilot review produced no actionable result',
  evidenceCompleted: 'Copilot completed successfully',
});

const SPANISH_SIMPLE: Readonly<Record<SimpleMessageKey, string>> = Object.freeze({
  heading: 'Ejecución de Copilot',
  repository: 'Repositorio',
  property: 'Propiedad',
  value: 'Valor',
  status: 'Estado',
  event: 'Evento',
  target: 'Destino',
  lifecycle: 'Ciclo de vida',
  descriptionPolicy: 'Política de descripción de PR',
  results: 'Resultados',
  findingStates: 'Estados de los hallazgos',
  bugbotReview: 'Revisión de Bugbot',
  sourceFreshness: 'Vigencia del origen',
  staleSourceSuppressed: 'Resultado obsoleto omitido; el HEAD de la rama cambió durante la ejecución',
  duplicateCleanup: 'Limpieza de duplicados',
  actionNotifications: 'Notificaciones de acción',
  actionNotificationCreated: 'creada',
  actionNotificationReused: 'reutilizada',
  resultDetails: 'Detalles del fallo',
  localization: 'Localización',
  repositoryLocale: 'Locale del repositorio',
  issueLocale: 'Locale de la issue',
  pullRequestLocale: 'Locale de la pull request',
  catalogResolution: 'Resolución del catálogo',
  descriptors: 'descriptores',
  reason: 'motivo',
  failure: 'Fallo',
  findings: 'Hallazgos',
  partial: 'Parcial',
  superseded: 'Sustituido',
  skipped: 'Omitido',
  dryRun: 'Simulación',
  success: 'Correcto',
  invalid: 'no válido',
  none: 'ninguno',
  resultSucceeded: 'Completado',
  resultFailed: 'Fallido',
  resultSkipped: 'Omitido',
  evidenceActionableFindings: 'Copilot encontró hallazgos que requieren atención',
  evidenceActionableFailures: 'Copilot encontró fallos que requieren atención',
  evidencePartialCoverage: 'La revisión de Copilot tiene cobertura parcial',
  evidenceSuperseded: 'La revisión de Copilot fue sustituida',
  evidenceSkipped: 'La revisión de Copilot fue omitida',
  evidenceNoActionableResult: 'La revisión de Copilot no produjo resultados que requieran atención',
  evidenceCompleted: 'Copilot terminó correctamente',
});

const ENGLISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'summary.target.pullRequest': 'PR #{number}',
  'summary.target.issue': 'Issue #{number}',
  'summary.target.repositoryRun': 'Repository run',
  'summary.bugbotTelemetry': '{outcome}, effort={effort}, {elapsed}ms',
  'summary.duplicateCleanup.single': 'Deletion was forbidden; retained a compact pointer for comment {ids}',
  'summary.duplicateCleanup.multiple': 'Deletion was forbidden; retained compact pointers for {count} comments (IDs: {ids})',
  'summary.duplicateCleanup.bounded': 'Deletion was forbidden; retained compact pointers for {count} comments (first {reported} IDs: {ids})',
  'summary.actionNotification.entry': '{topic} on {target}: {effect} (fingerprint {fingerprint})',
});

const SPANISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'summary.target.pullRequest': 'PR n.º {number}',
  'summary.target.issue': 'Issue n.º {number}',
  'summary.target.repositoryRun': 'Ejecución del repositorio',
  'summary.bugbotTelemetry': '{outcome}, esfuerzo={effort}, {elapsed} ms',
  'summary.duplicateCleanup.single': 'Se denegó el borrado; se conservó un enlace compacto para el comentario {ids}',
  'summary.duplicateCleanup.multiple': 'Se denegó el borrado; se conservaron enlaces compactos para {count} comentarios (ID: {ids})',
  'summary.duplicateCleanup.bounded': 'Se denegó el borrado; se conservaron enlaces compactos para {count} comentarios (primeros {reported} ID: {ids})',
  'summary.actionNotification.entry': '{topic} en {target}: {effect} (huella {fingerprint})',
});

const ENGLISH_FINDING_STATES: Readonly<Record<ActionSummaryFindingState, string>> = Object.freeze({
  open: 'open',
  reopened: 'reopened',
  fixed: 'fixed',
  obsolete: 'obsolete',
  dismissed: 'dismissed',
  'verification-required': 'verification required',
  unknown: 'unknown',
});

const SPANISH_FINDING_STATES: Readonly<Record<ActionSummaryFindingState, string>> = Object.freeze({
  open: 'abiertos',
  reopened: 'reabiertos',
  fixed: 'corregidos',
  obsolete: 'obsoletos',
  dismissed: 'descartados',
  'verification-required': 'requieren verificación',
  unknown: 'desconocidos',
});

function catalogMessages(
  simple: Readonly<Record<SimpleMessageKey, string>>,
  templates: Readonly<Record<TemplateMessageId, CatalogMessage>>,
  findingStates: Readonly<Record<ActionSummaryFindingState, string>>,
  errorMessages: Readonly<Record<ApplicationErrorMessageId, CatalogMessage>>,
): Readonly<Record<ActionSummaryMessageId, CatalogMessage>> {
  return Object.freeze({
    ...Object.fromEntries(SIMPLE_MESSAGE_KEYS.map(key => [`summary.${key}`, simple[key]])),
    ...templates,
    ...Object.fromEntries(FINDING_STATE_KEYS.map(key => [`summary.findingState.${key}`, findingStates[key]])),
    ...errorMessages,
  }) as Readonly<Record<ActionSummaryMessageId, CatalogMessage>>;
}

export const ENGLISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: catalogMessages(
    ENGLISH_SIMPLE,
    ENGLISH_TEMPLATES,
    ENGLISH_FINDING_STATES,
    ENGLISH_APPLICATION_ERROR_MESSAGES,
  ),
});

export const SPANISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: catalogMessages(
    SPANISH_SIMPLE,
    SPANISH_TEMPLATES,
    SPANISH_FINDING_STATES,
    SPANISH_APPLICATION_ERROR_MESSAGES,
  ),
});

export const ACTION_SUMMARY_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_ACTION_SUMMARY_DEFINITION,
  SPANISH_ACTION_SUMMARY_DEFINITION,
]);

export function resolveStaticActionSummaryCatalog(locale: string): ActionSummaryMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_ACTION_SUMMARY_DEFINITION,
    ACTION_SUMMARY_CATALOG_DEFINITIONS,
  );
}

export async function resolveActionSummaryCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<ActionSummaryMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    ACTION_SUMMARY_MESSAGE_IDS,
    ENGLISH_ACTION_SUMMARY_DEFINITION,
    ACTION_SUMMARY_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}
