import type { AgentConfiguration } from '../../domain/agent';
import {
  MESSAGE_CATALOG_VERSION,
  type CatalogMessage,
  type MessageCatalogDefinition,
} from '../../domain/message_catalog';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import type { BugbotPresentationDiagnostic } from '../contracts/bugbot_reconciliation';
import {
  resolveMessageCatalogView,
  resolveStaticMessageCatalogView,
  type ResolvedMessageCatalogView,
} from './resolved_message_catalog_policy';

export const BUGBOT_MESSAGE_IDS = Object.freeze([
  'bugbot.status.heading.partial',
  'bugbot.status.heading.verification',
  'bugbot.status.heading.complete',
  'bugbot.status.heading.attention',
  'bugbot.status.partial',
  'bugbot.status.unknown',
  'bugbot.status.syncFailure',
  'bugbot.status.clean',
  'bugbot.status.attention',
  'bugbot.status.action.partial',
  'bugbot.status.action.recheck',
  'bugbot.status.action.findings',
  'bugbot.status.findingsHeading',
  'bugbot.status.currentStatus',
  'bugbot.status.actionLabel',
  'bugbot.status.coverageSummary',
  'bugbot.status.recoverySummary',
  'bugbot.status.nav.pullRequest',
  'bugbot.status.nav.verifiedCommit',
  'bugbot.status.nav.workflowRun',
  'bugbot.status.duplicate.superseded',
  'bugbot.status.duplicate.viewCurrent',
  'bugbot.coverage.retained',
  'bugbot.coverage.omitted',
  'bugbot.coverage.truncated',
  'bugbot.coverage.providerLimit',
  'bugbot.snapshot.currentStatus',
  'bugbot.snapshot.partial',
  'bugbot.snapshot.unknown',
  'bugbot.snapshot.cleanTrackedOverflow',
  'bugbot.snapshot.clean',
  'bugbot.snapshot.attentionTrackedOverflow',
  'bugbot.snapshot.attention',
  'bugbot.snapshot.lastReconciled',
  'bugbot.snapshot.aggregateLink',
  'bugbot.snapshot.heading',
  'bugbot.snapshot.reported',
  'bugbot.snapshot.historical',
  'bugbot.snapshot.inline',
  'bugbot.finding.defaultTitle',
  'bugbot.finding.defaultDescription',
  'bugbot.finding.unspecified',
  'bugbot.finding.severity',
  'bugbot.finding.location',
  'bugbot.finding.category',
  'bugbot.finding.confidence',
  'bugbot.finding.evidence',
  'bugbot.finding.suggestedFix',
  'bugbot.finding.applyChange',
  'bugbot.finding.resolvedLabel',
  'bugbot.finding.dismissedLabel',
  'bugbot.finding.resolved.latest',
  'bugbot.finding.dismissed',
  'bugbot.finding.resolved.obsolete',
  'bugbot.finding.resolved.fixed',
  'bugbot.finding.anchorNote',
  'bugbot.review.findingsHeading',
  'bugbot.review.levelFindingsHeading',
  'bugbot.review.overflowHeading',
  'bugbot.review.overflowDetected',
  'bugbot.review.configurationHeading',
  'bugbot.review.rulesPrecedence',
  'bugbot.review.table.source',
  'bugbot.review.table.status',
  'bugbot.review.rule.truncated',
  'bugbot.review.rule.included',
  'bugbot.review.rule.omitted',
  'bugbot.overflow.heading',
  'bugbot.overflow.body',
  'bugbot.common.more',
  'bugbot.diagnostic.operationFailed',
  'bugbot.diagnostic.identityUnavailable',
  'bugbot.diagnostic.pullRequestCommentsFailed',
  'bugbot.diagnostic.reviewThreadsFailed',
  'bugbot.diagnostic.reviewsFailed',
  'bugbot.diagnostic.conversationFailed',
  'bugbot.diagnostic.linkedIssueCommentsFailed',
  'bugbot.diagnostic.navigationFailed',
  'bugbot.diagnostic.markerMalformed',
  'bugbot.diagnostic.providerOmittedFindings',
  'bugbot.diagnostic.publishedFindingUnobservable',
  'bugbot.diagnostic.reviewUpdateFailed',
  'bugbot.diagnostic.reviewUpdatesPending',
  'bugbot.diagnostic.statusCardUpdateFailed',
] as const);

export type BugbotMessageId = typeof BUGBOT_MESSAGE_IDS[number];
export type BugbotMessageCatalog = ResolvedMessageCatalogView<BugbotMessageId>;

const ENGLISH_MESSAGES: Readonly<Record<BugbotMessageId, CatalogMessage>> = Object.freeze({
  'bugbot.status.heading.partial': 'Bugbot: review incomplete',
  'bugbot.status.heading.verification': 'Bugbot: review needs verification',
  'bugbot.status.heading.complete': 'Bugbot: review complete',
  'bugbot.status.heading.attention': Object.freeze({ one: 'Bugbot: {count} finding needs attention', other: 'Bugbot: {count} findings need attention' }),
  'bugbot.status.partial': 'The review of {commit} has partial coverage and cannot declare the whole pull request clean.',
  'bugbot.status.unknown': Object.freeze({ one: '{count} finding has unknown state on {commit}.', other: '{count} findings have unknown state on {commit}.' }),
  'bugbot.status.syncFailure': 'Bugbot could not fully synchronize the state of {commit}.',
  'bugbot.status.clean': 'No active findings on {commit}.',
  'bugbot.status.attention': Object.freeze({ one: '{count} finding requires attention on {commit}.', other: '{count} findings require attention on {commit}.' }),
  'bugbot.status.action.partial': 'Do not treat this review as complete. Review the sources under Incomplete coverage and manually inspect omitted items; rerun only after reducing the relevant scope or restoring provider access.',
  'bugbot.status.action.recheck': 'Correct the reported cause, then run {command} once.',
  'bugbot.status.action.findings': 'Review the linked threads or comment {command}.',
  'bugbot.status.findingsHeading': 'Findings',
  'bugbot.status.currentStatus': 'Current status',
  'bugbot.status.actionLabel': 'Action',
  'bugbot.status.coverageSummary': 'Incomplete coverage',
  'bugbot.status.recoverySummary': 'Recovery details',
  'bugbot.status.nav.pullRequest': 'Pull request',
  'bugbot.status.nav.verifiedCommit': 'Verified commit',
  'bugbot.status.nav.workflowRun': 'Workflow run',
  'bugbot.status.duplicate.superseded': 'This status was superseded by the canonical card.',
  'bugbot.status.duplicate.viewCurrent': 'View current status',
  'bugbot.coverage.retained': 'retained={count}',
  'bugbot.coverage.omitted': 'omitted={count}',
  'bugbot.coverage.truncated': 'truncated={count}',
  'bugbot.coverage.providerLimit': 'provider page limit reached; additional older records are uncounted',
  'bugbot.snapshot.currentStatus': 'Current status',
  'bugbot.snapshot.partial': 'Overall coverage is partial; this snapshot does not prove that all of its findings are resolved.',
  'bugbot.snapshot.unknown': Object.freeze({ one: 'The state of {count} finding from this review could not be verified.', other: 'The state of {count} findings from this review could not be verified.' }),
  'bugbot.snapshot.cleanTrackedOverflow': 'No individually tracked finding from this review requires attention. The snapshot also contains historical overflow without individual threads; see the aggregate status.',
  'bugbot.snapshot.clean': 'All findings originating in this review are resolved.',
  'bugbot.snapshot.attentionTrackedOverflow': Object.freeze({ one: '{count} individually tracked finding from this review requires attention. The snapshot also contains historical overflow without individual threads.', other: '{count} individually tracked findings from this review require attention. The snapshot also contains historical overflow without individual threads.' }),
  'bugbot.snapshot.attention': Object.freeze({ one: '{count} finding originating in this review requires attention.', other: '{count} findings originating in this review require attention.' }),
  'bugbot.snapshot.lastReconciled': 'Last reconciled on {commit}.',
  'bugbot.snapshot.aggregateLink': 'See aggregate Bugbot status',
  'bugbot.snapshot.heading': 'Bugbot review snapshot',
  'bugbot.snapshot.reported': Object.freeze({ one: 'Bugbot reported {count} potential problem when commit {commit} was analyzed.', other: 'Bugbot reported {count} potential problems when commit {commit} was analyzed.' }),
  'bugbot.snapshot.historical': 'This snapshot is historical; use the status block above for current state.',
  'bugbot.snapshot.inline': Object.freeze({ one: '{count} finding is linked to changed code.', other: '{count} findings are linked to changed code.' }),
  'bugbot.finding.defaultTitle': 'Potential problem',
  'bugbot.finding.defaultDescription': 'No description provided.',
  'bugbot.finding.unspecified': 'unspecified',
  'bugbot.finding.severity': 'Severity',
  'bugbot.finding.location': 'Location',
  'bugbot.finding.category': 'Category',
  'bugbot.finding.confidence': 'Confidence',
  'bugbot.finding.evidence': 'Evidence',
  'bugbot.finding.suggestedFix': 'Suggested fix',
  'bugbot.finding.applyChange': 'Apply this change',
  'bugbot.finding.resolvedLabel': 'Resolved',
  'bugbot.finding.dismissedLabel': 'Dismissed',
  'bugbot.finding.resolved.latest': 'No longer reported in the latest analysis.',
  'bugbot.finding.dismissed': 'Explicitly dismissed by an authorized user.',
  'bugbot.finding.resolved.obsolete': 'No longer applies in the latest analysis.',
  'bugbot.finding.resolved.fixed': 'The configured agent confirmed it was fixed in the latest analysis.',
  'bugbot.finding.anchorNote': 'Review-level finding: the reported location is not part of this pull request diff, so this comment is attached to the first changed file.',
  'bugbot.review.findingsHeading': 'Findings',
  'bugbot.review.levelFindingsHeading': 'Review-level findings',
  'bugbot.review.overflowHeading': 'Additional findings omitted by the comment limit',
  'bugbot.review.overflowDetected': Object.freeze({ one: '{count} additional finding was detected.', other: '{count} additional findings were detected.' }),
  'bugbot.review.configurationHeading': 'Review configuration',
  'bugbot.review.rulesPrecedence': 'Rules in effective precedence order:',
  'bugbot.review.table.source': 'Source',
  'bugbot.review.table.status': 'Status',
  'bugbot.review.rule.truncated': 'truncated',
  'bugbot.review.rule.included': 'included',
  'bugbot.review.rule.omitted': Object.freeze({ one: '{count} omitted by duplicate, empty, or combined-budget policy', other: '{count} omitted by duplicate, empty, or combined-budget policy' }),
  'bugbot.overflow.heading': 'More findings (comment limit)',
  'bugbot.overflow.body': Object.freeze({ one: 'There is {count} more finding that was not published as an individual comment. Review locally or in the full diff to see the list.', other: 'There are {count} more findings that were not published as individual comments. Review locally or in the full diff to see the list.' }),
  'bugbot.common.more': Object.freeze({ one: 'and {count} more.', other: 'and {count} more.' }),
  'bugbot.diagnostic.operationFailed': 'Bugbot could not complete one or more finding mutations.',
  'bugbot.diagnostic.identityUnavailable': 'The authenticated Bugbot identity is unavailable.',
  'bugbot.diagnostic.pullRequestCommentsFailed': 'Unable to re-read pull request review comments.',
  'bugbot.diagnostic.reviewThreadsFailed': 'Unable to re-read pull request review thread state.',
  'bugbot.diagnostic.reviewsFailed': 'Unable to re-read pull request reviews.',
  'bugbot.diagnostic.conversationFailed': 'Unable to re-read the pull request conversation.',
  'bugbot.diagnostic.linkedIssueCommentsFailed': 'Unable to re-read linked issue finding comments.',
  'bugbot.diagnostic.navigationFailed': 'Unable to build safe Bugbot navigation links.',
  'bugbot.diagnostic.markerMalformed': 'A trusted Bugbot finding marker is malformed.',
  'bugbot.diagnostic.providerOmittedFindings': Object.freeze({ one: 'The final provider snapshot omitted {count} previously observed unresolved or unverified Bugbot finding.', other: 'The final provider snapshot omitted {count} previously observed unresolved or unverified Bugbot findings.' }),
  'bugbot.diagnostic.publishedFindingUnobservable': 'Published finding {findingId} is not yet observable from GitHub.',
  'bugbot.diagnostic.reviewUpdateFailed': 'Unable to update Bugbot review {reviewIdentity}.',
  'bugbot.diagnostic.reviewUpdatesPending': Object.freeze({ one: '{count} Bugbot review status block remains pending; run {command}.', other: '{count} Bugbot review status blocks remain pending; run {command}.' }),
  'bugbot.diagnostic.statusCardUpdateFailed': 'Unable to create or update the canonical Bugbot PR status card.',
});

// Current Node.js Intl/CLDR cardinal rules expose `one`, `many`, and `other`
// for Spanish. The uncommon `many` category covers exponent-form numbers;
// bundled definitions intentionally match the runtime category set exactly.
const SPANISH_MESSAGES: Readonly<Record<BugbotMessageId, CatalogMessage>> = Object.freeze({
  'bugbot.status.heading.partial': 'Bugbot: revisión incompleta',
  'bugbot.status.heading.verification': 'Bugbot: la revisión necesita verificación',
  'bugbot.status.heading.complete': 'Bugbot: revisión completada',
  'bugbot.status.heading.attention': Object.freeze({ one: 'Bugbot: {count} hallazgo requiere atención', many: 'Bugbot: {count} hallazgos requieren atención', other: 'Bugbot: {count} hallazgos requieren atención' }),
  'bugbot.status.partial': 'La revisión de {commit} tiene cobertura parcial; no puede declarar limpio el pull request completo.',
  'bugbot.status.unknown': Object.freeze({ one: '{count} hallazgo tiene un estado desconocido en {commit}.', many: '{count} hallazgos tienen un estado desconocido en {commit}.', other: '{count} hallazgos tienen un estado desconocido en {commit}.' }),
  'bugbot.status.syncFailure': 'Bugbot no pudo sincronizar por completo el estado de {commit}.',
  'bugbot.status.clean': 'No hay hallazgos activos en {commit}.',
  'bugbot.status.attention': Object.freeze({ one: '{count} hallazgo requiere atención en {commit}.', many: '{count} hallazgos requieren atención en {commit}.', other: '{count} hallazgos requieren atención en {commit}.' }),
  'bugbot.status.action.partial': 'No consideres completa esta revisión. Revisa las fuentes en Cobertura incompleta e inspecciona manualmente los elementos omitidos; repite la revisión solo después de reducir el alcance relevante o restaurar el acceso al proveedor.',
  'bugbot.status.action.recheck': 'Corrige la causa indicada y ejecuta {command} una vez.',
  'bugbot.status.action.findings': 'Revisa los hilos enlazados o comenta {command}.',
  'bugbot.status.findingsHeading': 'Hallazgos',
  'bugbot.status.currentStatus': 'Estado actual',
  'bugbot.status.actionLabel': 'Acción',
  'bugbot.status.coverageSummary': 'Cobertura incompleta',
  'bugbot.status.recoverySummary': 'Detalles de recuperación',
  'bugbot.status.nav.pullRequest': 'Pull request',
  'bugbot.status.nav.verifiedCommit': 'Commit verificado',
  'bugbot.status.nav.workflowRun': 'Ejecución',
  'bugbot.status.duplicate.superseded': 'Este estado fue reemplazado por la tarjeta canónica.',
  'bugbot.status.duplicate.viewCurrent': 'Ver estado actual',
  'bugbot.coverage.retained': 'conservados={count}',
  'bugbot.coverage.omitted': 'omitidos={count}',
  'bugbot.coverage.truncated': 'truncados={count}',
  'bugbot.coverage.providerLimit': 'se alcanzó el límite de páginas del proveedor; los registros anteriores adicionales no están contabilizados',
  'bugbot.snapshot.currentStatus': 'Estado actual',
  'bugbot.snapshot.partial': 'La cobertura global es parcial; esta instantánea no demuestra que todos sus hallazgos estén resueltos.',
  'bugbot.snapshot.unknown': Object.freeze({ one: 'No se pudo verificar el estado de {count} hallazgo de esta revisión.', many: 'No se pudo verificar el estado de {count} hallazgos de esta revisión.', other: 'No se pudo verificar el estado de {count} hallazgos de esta revisión.' }),
  'bugbot.snapshot.cleanTrackedOverflow': 'Ningún hallazgo con seguimiento individual de esta revisión requiere atención. La instantánea también contiene hallazgos históricos sin hilo individual; consulta el estado agregado.',
  'bugbot.snapshot.clean': 'Todos los hallazgos originados en esta revisión están resueltos.',
  'bugbot.snapshot.attentionTrackedOverflow': Object.freeze({ one: '{count} hallazgo con seguimiento individual de esta revisión requiere atención. La instantánea también contiene hallazgos históricos sin hilo individual.', many: '{count} hallazgos con seguimiento individual de esta revisión requieren atención. La instantánea también contiene hallazgos históricos sin hilo individual.', other: '{count} hallazgos con seguimiento individual de esta revisión requieren atención. La instantánea también contiene hallazgos históricos sin hilo individual.' }),
  'bugbot.snapshot.attention': Object.freeze({ one: '{count} hallazgo originado en esta revisión requiere atención.', many: '{count} hallazgos originados en esta revisión requieren atención.', other: '{count} hallazgos originados en esta revisión requieren atención.' }),
  'bugbot.snapshot.lastReconciled': 'Última reconciliación en {commit}.',
  'bugbot.snapshot.aggregateLink': 'Ver estado agregado de Bugbot',
  'bugbot.snapshot.heading': 'Instantánea de la revisión de Bugbot',
  'bugbot.snapshot.reported': Object.freeze({ one: 'Bugbot reportó {count} problema potencial cuando se analizó el commit {commit}.', many: 'Bugbot reportó {count} problemas potenciales cuando se analizó el commit {commit}.', other: 'Bugbot reportó {count} problemas potenciales cuando se analizó el commit {commit}.' }),
  'bugbot.snapshot.historical': 'Esta instantánea es histórica; usa el bloque de estado superior para conocer el estado actual.',
  'bugbot.snapshot.inline': Object.freeze({ one: '{count} hallazgo está enlazado al código modificado.', many: '{count} hallazgos están enlazados al código modificado.', other: '{count} hallazgos están enlazados al código modificado.' }),
  'bugbot.finding.defaultTitle': 'Problema potencial',
  'bugbot.finding.defaultDescription': 'No se proporcionó una descripción.',
  'bugbot.finding.unspecified': 'sin especificar',
  'bugbot.finding.severity': 'Severidad',
  'bugbot.finding.location': 'Ubicación',
  'bugbot.finding.category': 'Categoría',
  'bugbot.finding.confidence': 'Confianza',
  'bugbot.finding.evidence': 'Evidencia',
  'bugbot.finding.suggestedFix': 'Corrección sugerida',
  'bugbot.finding.applyChange': 'Aplicar este cambio',
  'bugbot.finding.resolvedLabel': 'Resuelto',
  'bugbot.finding.dismissedLabel': 'Descartado',
  'bugbot.finding.resolved.latest': 'Ya no se reporta en el análisis más reciente.',
  'bugbot.finding.dismissed': 'Lo descartó explícitamente un usuario autorizado.',
  'bugbot.finding.resolved.obsolete': 'Ya no es aplicable en el análisis más reciente.',
  'bugbot.finding.resolved.fixed': 'El agente configurado confirmó la corrección en el análisis más reciente.',
  'bugbot.finding.anchorNote': 'Hallazgo a nivel de revisión: la ubicación reportada no forma parte del diff de este pull request, por lo que el comentario se adjunta al primer archivo modificado.',
  'bugbot.review.findingsHeading': 'Hallazgos',
  'bugbot.review.levelFindingsHeading': 'Hallazgos a nivel de revisión',
  'bugbot.review.overflowHeading': 'Hallazgos adicionales omitidos por el límite de comentarios',
  'bugbot.review.overflowDetected': Object.freeze({ one: 'Se detectó {count} hallazgo adicional.', many: 'Se detectaron {count} hallazgos adicionales.', other: 'Se detectaron {count} hallazgos adicionales.' }),
  'bugbot.review.configurationHeading': 'Configuración de la revisión',
  'bugbot.review.rulesPrecedence': 'Reglas en orden de precedencia efectiva:',
  'bugbot.review.table.source': 'Fuente',
  'bugbot.review.table.status': 'Estado',
  'bugbot.review.rule.truncated': 'truncada',
  'bugbot.review.rule.included': 'incluida',
  'bugbot.review.rule.omitted': Object.freeze({ one: '{count} omitida por la política de duplicados, contenido vacío o presupuesto combinado', many: '{count} omitidas por la política de duplicados, contenido vacío o presupuesto combinado', other: '{count} omitidas por la política de duplicados, contenido vacío o presupuesto combinado' }),
  'bugbot.overflow.heading': 'Más hallazgos (límite de comentarios)',
  'bugbot.overflow.body': Object.freeze({ one: 'Hay {count} hallazgo más que no se publicó como comentario individual. Revísalo localmente o en el diff completo para consultar la lista.', many: 'Hay {count} hallazgos más que no se publicaron como comentarios individuales. Revísalos localmente o en el diff completo para consultar la lista.', other: 'Hay {count} hallazgos más que no se publicaron como comentarios individuales. Revísalos localmente o en el diff completo para consultar la lista.' }),
  'bugbot.common.more': Object.freeze({ one: 'y {count} más.', many: 'y {count} más.', other: 'y {count} más.' }),
  'bugbot.diagnostic.operationFailed': 'Bugbot no pudo completar una o más mutaciones de hallazgos.',
  'bugbot.diagnostic.identityUnavailable': 'La identidad autenticada de Bugbot no está disponible.',
  'bugbot.diagnostic.pullRequestCommentsFailed': 'No se pudieron volver a leer los comentarios del review del pull request.',
  'bugbot.diagnostic.reviewThreadsFailed': 'No se pudo volver a leer el estado de los hilos de revisión del pull request.',
  'bugbot.diagnostic.reviewsFailed': 'No se pudieron volver a leer las revisiones del pull request.',
  'bugbot.diagnostic.conversationFailed': 'No se pudo volver a leer la conversación del pull request.',
  'bugbot.diagnostic.linkedIssueCommentsFailed': 'No se pudieron volver a leer los comentarios de hallazgos de la issue enlazada.',
  'bugbot.diagnostic.navigationFailed': 'No se pudieron crear enlaces de navegación seguros para Bugbot.',
  'bugbot.diagnostic.markerMalformed': 'Un marcador de hallazgo de Bugbot de confianza tiene un formato incorrecto.',
  'bugbot.diagnostic.providerOmittedFindings': Object.freeze({ one: 'El snapshot final del proveedor omitió {count} hallazgo de Bugbot no resuelto o no verificado que se había observado antes.', many: 'El snapshot final del proveedor omitió {count} hallazgos de Bugbot no resueltos o no verificados que se habían observado antes.', other: 'El snapshot final del proveedor omitió {count} hallazgos de Bugbot no resueltos o no verificados que se habían observado antes.' }),
  'bugbot.diagnostic.publishedFindingUnobservable': 'El hallazgo publicado {findingId} todavía no se puede observar en GitHub.',
  'bugbot.diagnostic.reviewUpdateFailed': 'No se pudo actualizar la revisión de Bugbot {reviewIdentity}.',
  'bugbot.diagnostic.reviewUpdatesPending': Object.freeze({ one: 'Queda {count} bloque de estado de revisión de Bugbot pendiente; ejecuta {command}.', many: 'Quedan {count} bloques de estado de revisión de Bugbot pendientes; ejecuta {command}.', other: 'Quedan {count} bloques de estado de revisión de Bugbot pendientes; ejecuta {command}.' }),
  'bugbot.diagnostic.statusCardUpdateFailed': 'No se pudo crear o actualizar la tarjeta canónica de estado de Bugbot en el PR.',
});

export const ENGLISH_BUGBOT_DEFINITION: MessageCatalogDefinition<BugbotMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: ENGLISH_MESSAGES,
});

export const SPANISH_BUGBOT_DEFINITION: MessageCatalogDefinition<BugbotMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: SPANISH_MESSAGES,
});

export const BUGBOT_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_BUGBOT_DEFINITION,
  SPANISH_BUGBOT_DEFINITION,
]);

export function resolveStaticBugbotCatalog(locale: string): BugbotMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_BUGBOT_DEFINITION,
    BUGBOT_CATALOG_DEFINITIONS,
  );
}

export async function resolveBugbotCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<BugbotMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    BUGBOT_MESSAGE_IDS,
    ENGLISH_BUGBOT_DEFINITION,
    BUGBOT_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}

export function renderBugbotDiagnostic(
  diagnostic: BugbotPresentationDiagnostic,
  catalog: BugbotMessageCatalog,
): string {
  switch (diagnostic.code) {
    case 'operation-failed': return catalog.message('bugbot.diagnostic.operationFailed');
    case 'identity-unavailable': return catalog.message('bugbot.diagnostic.identityUnavailable');
    case 'snapshot-pull-request-comments-failed': return catalog.message('bugbot.diagnostic.pullRequestCommentsFailed');
    case 'snapshot-review-threads-failed': return catalog.message('bugbot.diagnostic.reviewThreadsFailed');
    case 'snapshot-reviews-failed': return catalog.message('bugbot.diagnostic.reviewsFailed');
    case 'snapshot-conversation-failed': return catalog.message('bugbot.diagnostic.conversationFailed');
    case 'snapshot-linked-issue-comments-failed': return catalog.message('bugbot.diagnostic.linkedIssueCommentsFailed');
    case 'snapshot-navigation-failed': return catalog.message('bugbot.diagnostic.navigationFailed');
    case 'marker-malformed': return catalog.message('bugbot.diagnostic.markerMalformed');
    case 'provider-omitted-findings':
      return catalog.message('bugbot.diagnostic.providerOmittedFindings', { count: diagnostic.count }, diagnostic.count);
    case 'published-finding-unobservable':
      return catalog.message('bugbot.diagnostic.publishedFindingUnobservable', { findingId: diagnostic.findingId });
    case 'review-update-failed':
      return catalog.message('bugbot.diagnostic.reviewUpdateFailed', { reviewIdentity: diagnostic.reviewIdentity });
    case 'review-updates-pending':
      return catalog.message('bugbot.diagnostic.reviewUpdatesPending', {
        count: diagnostic.count,
        command: '/copilot recheck',
      }, diagnostic.count);
    case 'status-card-update-failed': return catalog.message('bugbot.diagnostic.statusCardUpdateFailed');
  }
}

export function bugbotDiagnosticOperatorMessage(
  diagnostic: BugbotPresentationDiagnostic,
): string {
  if (diagnostic.code === 'operation-failed') return diagnostic.operatorMessage.slice(0, 500);
  return renderBugbotDiagnostic(diagnostic, resolveStaticBugbotCatalog('en-US'));
}
