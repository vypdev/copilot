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

const SIMPLE_MESSAGE_KEYS = Object.freeze([
  'heading', 'repository', 'property', 'value', 'status', 'event', 'target',
  'lifecycle', 'descriptionPolicy', 'results', 'findingStates', 'bugbotReview',
  'resultDetails', 'localization', 'repositoryLocale', 'issueLocale',
  'pullRequestLocale', 'catalogResolution', 'descriptors', 'reason', 'failure',
  'findings', 'partial', 'superseded', 'skipped', 'dryRun', 'success', 'invalid',
  'none', 'noResult', 'unnamedResult', 'impact', 'cause', 'action',
  'retainedState', 'reference',
] as const);

const TEMPLATE_MESSAGE_IDS = Object.freeze([
  'summary.target.pullRequest',
  'summary.target.issue',
  'summary.target.repositoryRun',
  'summary.bugbotTelemetry',
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

export type ActionSummaryMessageId = SimpleMessageId | TemplateMessageId | FindingStateMessageId;
export type ActionSummaryMessageCatalog = ResolvedMessageCatalogView<ActionSummaryMessageId>;

export const ACTION_SUMMARY_MESSAGE_IDS: readonly ActionSummaryMessageId[] = Object.freeze([
  ...SIMPLE_MESSAGE_KEYS.map(key => `summary.${key}` as const),
  ...TEMPLATE_MESSAGE_IDS,
  ...FINDING_STATE_KEYS.map(key => `summary.findingState.${key}` as const),
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
  resultDetails: 'Result details',
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
  noResult: 'No application result was produced.',
  unnamedResult: 'Unnamed result',
  impact: 'Impact',
  cause: 'Cause',
  action: 'Action',
  retainedState: 'Retained state',
  reference: 'Reference',
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
  resultDetails: 'Detalles del resultado',
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
  noResult: 'No se ha producido ningún resultado de aplicación.',
  unnamedResult: 'Resultado sin nombre',
  impact: 'Impacto',
  cause: 'Causa',
  action: 'Acción',
  retainedState: 'Estado conservado',
  reference: 'Referencia',
});

const ENGLISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'summary.target.pullRequest': 'PR #{number}',
  'summary.target.issue': 'Issue #{number}',
  'summary.target.repositoryRun': 'Repository run',
  'summary.bugbotTelemetry': '{outcome}, effort={effort}, {elapsed}ms',
});

const SPANISH_TEMPLATES: Readonly<Record<TemplateMessageId, CatalogMessage>> = Object.freeze({
  'summary.target.pullRequest': 'PR n.º {number}',
  'summary.target.issue': 'Issue n.º {number}',
  'summary.target.repositoryRun': 'Ejecución del repositorio',
  'summary.bugbotTelemetry': '{outcome}, esfuerzo={effort}, {elapsed} ms',
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
): Readonly<Record<ActionSummaryMessageId, CatalogMessage>> {
  return Object.freeze({
    ...Object.fromEntries(SIMPLE_MESSAGE_KEYS.map(key => [`summary.${key}`, simple[key]])),
    ...templates,
    ...Object.fromEntries(FINDING_STATE_KEYS.map(key => [`summary.findingState.${key}`, findingStates[key]])),
  }) as Readonly<Record<ActionSummaryMessageId, CatalogMessage>>;
}

export const ENGLISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: catalogMessages(ENGLISH_SIMPLE, ENGLISH_TEMPLATES, ENGLISH_FINDING_STATES),
});

export const SPANISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: catalogMessages(SPANISH_SIMPLE, SPANISH_TEMPLATES, SPANISH_FINDING_STATES),
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
