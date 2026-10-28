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
  'inactivity', 'unavailable', 'issueCleanup',
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
  'optionalEvidenceHeading',
  'optionalEvidenceImpact',
  'optionalEvidenceRetained',
  'optionalEvidenceTechnical',
  'optionalEvidenceSummaryUnavailable',
  'optionalEvidenceCredentialInvalid',
  'optionalEvidenceDenied',
  'optionalEvidenceRateLimited',
  'optionalEvidenceNotFound',
  'optionalEvidenceInvalidTarget',
  'optionalEvidenceConflict',
  'optionalEvidenceUnavailable',
  'optionalEvidenceUnknown',
  'optionalEvidenceCredentialAction',
  'optionalEvidenceRateAction',
  'optionalEvidenceTargetAction',
  'optionalEvidenceInspectAction',
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
  'summary.inactivityCounts',
  'summary.issueCleanupCounts',
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
  inactivity: 'Issue inactivity',
  issueCleanup: 'Issue cleanup',
  unavailable: 'unavailable',
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
  optionalEvidenceHeading: "Optional Check Run publication not confirmed",
  optionalEvidenceImpact: "Impact: Native check status is not confirmed. The workflow result and existing Job Summary remain authoritative.",
  optionalEvidenceRetained: "Retained state: Required-stage results and completed external effects were preserved. This optional diagnostic does not change workflow success or failure.",
  optionalEvidenceTechnical: "Check publication details",
  optionalEvidenceCredentialInvalid: "Cause: GitHub rejected the publication credential.",
  optionalEvidenceDenied: "Cause: GitHub denied the check publication request. The credential type and exact policy cause are not inferred.",
  optionalEvidenceRateLimited: "Cause: GitHub reported rate limiting for check publication.",
  optionalEvidenceNotFound: "Cause: The check target or repository visibility was not available.",
  optionalEvidenceInvalidTarget: "Cause: The Check Run request or provider response was invalid.",
  optionalEvidenceConflict: "Cause: GitHub reported a conflict while publishing the check.",
  optionalEvidenceUnavailable: "Cause: The provider or transport did not confirm check publication. A check may already exist at this head.",
  optionalEvidenceUnknown: "Cause: No safe provider diagnostic was available. The underlying cause is not established.",
  optionalEvidenceCredentialAction: "Action: Verify repository access and Checks write permission on the dedicated evidence credential. Generated commit workflows use the step-scoped github.token; keep the product Action token separate. Inspect the exact head before retrying.",
  optionalEvidenceRateAction: "Action: Follow the provider rate-limit guidance, inspect checks at the exact head, and retry only after the limit clears. No automatic retry was made.",
  optionalEvidenceTargetAction: "Action: Verify the immutable head, repository access and Check Run request. Inspect existing checks before retrying.",
  optionalEvidenceInspectAction: "Action: Inspect checks at the exact head and the safe provider reference before retrying. Do not infer an outage or widen product credentials from this warning alone.",
  optionalEvidenceSummaryUnavailable: "The optional Check Run diagnostic remains in the run log; its Job Summary appendix was not confirmed.",
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
  inactivity: 'Inactividad de issues',
  issueCleanup: 'Limpieza de la issue',
  unavailable: 'no disponible',
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
  optionalEvidenceHeading: "Publicación del Check Run opcional no confirmada",
  optionalEvidenceImpact: "Impacto: El estado del check nativo no está confirmado. Se conservan el resultado del workflow y el Job Summary existente.",
  optionalEvidenceRetained: "Estado conservado: Se preservan los resultados de las etapas requeridas y los efectos externos completados. Este diagnóstico opcional no cambia el éxito o fallo del workflow.",
  optionalEvidenceTechnical: "Detalles de la publicación del check",
  optionalEvidenceCredentialInvalid: "Causa: GitHub rechazó la credencial de publicación.",
  optionalEvidenceDenied: "Causa: GitHub denegó la publicación del check. No se infieren el tipo de credencial ni la política concreta que la denegó.",
  optionalEvidenceRateLimited: "Causa: GitHub notificó un límite de peticiones para la publicación del check.",
  optionalEvidenceNotFound: "Causa: El destino del check o la visibilidad del repositorio no estaba disponible.",
  optionalEvidenceInvalidTarget: "Causa: La petición del Check Run o la respuesta del proveedor no era válida.",
  optionalEvidenceConflict: "Causa: GitHub notificó un conflicto al publicar el check.",
  optionalEvidenceUnavailable: "Causa: El proveedor o el transporte no confirmó la publicación del check. Puede que ya exista un check para este head.",
  optionalEvidenceUnknown: "Causa: No hay un diagnóstico seguro del proveedor. La causa subyacente no está demostrada.",
  optionalEvidenceCredentialAction: "Acción: Comprueba el acceso al repositorio y el permiso Checks write de la credencial de evidencia dedicada. Los workflows de commits generados usan github.token limitado al paso; conserva separado el token de las operaciones de la Action. Inspecciona el head exacto antes de reintentar.",
  optionalEvidenceRateAction: "Acción: Sigue las indicaciones del límite del proveedor, inspecciona los checks del head exacto y reintenta cuando termine el límite. No se ha reintentado automáticamente.",
  optionalEvidenceTargetAction: "Acción: Verifica el head inmutable, el acceso al repositorio y la petición del Check Run. Inspecciona los checks existentes antes de reintentar.",
  optionalEvidenceInspectAction: "Acción: Inspecciona los checks del head exacto y la referencia segura del proveedor antes de reintentar. Este aviso por sí solo no demuestra una caída ni justifica ampliar las credenciales de las operaciones.",
  optionalEvidenceSummaryUnavailable: "El diagnóstico del Check Run opcional se conserva en el log; no se confirmó su anexo al Job Summary.",
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
  'summary.inactivityCounts': 'Scanned: {scanned} · Closed: {closed} · Skipped: {skipped}',
  'summary.issueCleanupCounts': 'Reconciled: {reconciled} · Already converged: {converged}. Required cleanup was freshly verified.',
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
  'summary.inactivityCounts': 'Examinadas: {scanned} · Cerradas: {closed} · Omitidas: {skipped}',
  'summary.issueCleanupCounts': 'Reconciliadas: {reconciled} · Ya convergidas: {converged}. Se verificó de nuevo la limpieza necesaria.',
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
