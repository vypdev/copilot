import type { AgentConfiguration } from '../../domain/agent';
import type { ApplicationErrorKind } from '../../data/model/application_error';
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
  'retainedState', 'reference', 'retryable', 'yes', 'no',
  'resultSucceeded', 'resultFailed', 'resultSkipped',
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

const ERROR_KIND_KEYS: readonly ApplicationErrorKind[] = Object.freeze([
  'configuration', 'authorization', 'provider', 'agent', 'validation', 'workflow', 'unknown',
]);

const ERROR_FIELD_KEYS = Object.freeze(['impact', 'action', 'retainedState'] as const);

type SimpleMessageKey = typeof SIMPLE_MESSAGE_KEYS[number];
type SimpleMessageId = `summary.${SimpleMessageKey}`;
type TemplateMessageId = typeof TEMPLATE_MESSAGE_IDS[number];
export type ActionSummaryFindingState = typeof FINDING_STATE_KEYS[number];
type FindingStateMessageId = `summary.findingState.${ActionSummaryFindingState}`;
type ErrorField = typeof ERROR_FIELD_KEYS[number];
type ErrorMessageId = `summary.error.${ApplicationErrorKind}.${ErrorField}`;

export type ActionSummaryMessageId = SimpleMessageId | TemplateMessageId | FindingStateMessageId | ErrorMessageId;
export type ActionSummaryMessageCatalog = ResolvedMessageCatalogView<ActionSummaryMessageId>;

export const ACTION_SUMMARY_MESSAGE_IDS: readonly ActionSummaryMessageId[] = Object.freeze([
  ...SIMPLE_MESSAGE_KEYS.map(key => `summary.${key}` as const),
  ...TEMPLATE_MESSAGE_IDS,
  ...FINDING_STATE_KEYS.map(key => `summary.findingState.${key}` as const),
  ...ERROR_KIND_KEYS.flatMap(kind => ERROR_FIELD_KEYS.map(field => `summary.error.${kind}.${field}` as const)),
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
  cause: 'Error code',
  action: 'Action',
  retainedState: 'Retained state',
  reference: 'Reference',
  retryable: 'Retryable',
  yes: 'Yes',
  no: 'No',
  resultSucceeded: 'Succeeded',
  resultFailed: 'Failed',
  resultSkipped: 'Skipped',
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
  cause: 'Código de error',
  action: 'Acción',
  retainedState: 'Estado conservado',
  reference: 'Referencia',
  retryable: 'Reintentable',
  yes: 'Sí',
  no: 'No',
  resultSucceeded: 'Completado',
  resultFailed: 'Fallido',
  resultSkipped: 'Omitido',
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

type ErrorMessages = Readonly<Record<ApplicationErrorKind, Readonly<Record<ErrorField, string>>>>;

const ENGLISH_ERRORS: ErrorMessages = Object.freeze({
  configuration: Object.freeze({
    impact: 'The operation could not use the configured values.',
    action: 'Correct the configuration or choose a supported capability before retrying.',
    retainedState: 'No new state or external effect was created.',
  }),
  authorization: Object.freeze({
    impact: 'The operation could not authenticate or access a required resource.',
    action: 'Correct the credential or grant the documented permission before retrying.',
    retainedState: 'No new state or external effect was created.',
  }),
  provider: Object.freeze({
    impact: 'A provider operation did not complete.',
    action: 'Inspect the error code and retry only when the provider state or availability has changed.',
    retainedState: 'Existing state and completed external effects remain in place.',
  }),
  agent: Object.freeze({
    impact: 'The configured agent did not produce usable product content.',
    action: 'Inspect the sanitized agent status and retry with a compatible provider or model.',
    retainedState: 'Existing state remains in place; rejected content was not published.',
  }),
  validation: Object.freeze({
    impact: 'The supplied input was rejected before the operation could continue.',
    action: 'Correct the input and retry.',
    retainedState: 'No new state or external effect was created.',
  }),
  workflow: Object.freeze({
    impact: 'The workflow could not complete the requested operation.',
    action: 'Inspect the current state and retry only if the operation is still required.',
    retainedState: 'Existing state and confirmed completed effects remain in place.',
  }),
  unknown: Object.freeze({
    impact: 'An unexpected failure was handled safely.',
    action: 'Use the reference to investigate before retrying.',
    retainedState: 'Existing state and confirmed completed effects remain in place.',
  }),
});

const SPANISH_ERRORS: ErrorMessages = Object.freeze({
  configuration: Object.freeze({
    impact: 'La operación no pudo usar los valores configurados.',
    action: 'Corrige la configuración o elige una capacidad compatible antes de reintentarlo.',
    retainedState: 'No se creó ningún estado ni efecto externo nuevo.',
  }),
  authorization: Object.freeze({
    impact: 'La operación no pudo autenticarse o acceder a un recurso necesario.',
    action: 'Corrige la credencial o concede el permiso documentado antes de reintentarlo.',
    retainedState: 'No se creó ningún estado ni efecto externo nuevo.',
  }),
  provider: Object.freeze({
    impact: 'Una operación del proveedor no se completó.',
    action: 'Revisa el código de error y reinténtalo solo cuando haya cambiado el estado o la disponibilidad del proveedor.',
    retainedState: 'El estado existente y los efectos externos completados se mantienen.',
  }),
  agent: Object.freeze({
    impact: 'El agente configurado no produjo contenido de producto utilizable.',
    action: 'Revisa el estado saneado del agente y reinténtalo con un proveedor o modelo compatible.',
    retainedState: 'El estado existente se mantiene y el contenido rechazado no se publicó.',
  }),
  validation: Object.freeze({
    impact: 'La entrada suministrada se rechazó antes de continuar la operación.',
    action: 'Corrige la entrada y reinténtalo.',
    retainedState: 'No se creó ningún estado ni efecto externo nuevo.',
  }),
  workflow: Object.freeze({
    impact: 'El workflow no pudo completar la operación solicitada.',
    action: 'Revisa el estado actual y reinténtalo solo si la operación sigue siendo necesaria.',
    retainedState: 'El estado existente y los efectos completados y confirmados se mantienen.',
  }),
  unknown: Object.freeze({
    impact: 'Un fallo inesperado se gestionó de forma segura.',
    action: 'Usa la referencia para investigar antes de reintentarlo.',
    retainedState: 'El estado existente y los efectos completados y confirmados se mantienen.',
  }),
});

function catalogMessages(
  simple: Readonly<Record<SimpleMessageKey, string>>,
  templates: Readonly<Record<TemplateMessageId, CatalogMessage>>,
  findingStates: Readonly<Record<ActionSummaryFindingState, string>>,
  errors: ErrorMessages,
): Readonly<Record<ActionSummaryMessageId, CatalogMessage>> {
  return Object.freeze({
    ...Object.fromEntries(SIMPLE_MESSAGE_KEYS.map(key => [`summary.${key}`, simple[key]])),
    ...templates,
    ...Object.fromEntries(FINDING_STATE_KEYS.map(key => [`summary.findingState.${key}`, findingStates[key]])),
    ...Object.fromEntries(ERROR_KIND_KEYS.flatMap(kind => ERROR_FIELD_KEYS.map(field => [
      `summary.error.${kind}.${field}`,
      errors[kind][field],
    ]))),
  }) as Readonly<Record<ActionSummaryMessageId, CatalogMessage>>;
}

export const ENGLISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: catalogMessages(ENGLISH_SIMPLE, ENGLISH_TEMPLATES, ENGLISH_FINDING_STATES, ENGLISH_ERRORS),
});

export const SPANISH_ACTION_SUMMARY_DEFINITION: MessageCatalogDefinition<ActionSummaryMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: catalogMessages(SPANISH_SIMPLE, SPANISH_TEMPLATES, SPANISH_FINDING_STATES, SPANISH_ERRORS),
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
