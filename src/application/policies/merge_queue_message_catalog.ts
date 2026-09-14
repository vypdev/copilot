import type { CatalogMessage } from '../../domain/message_catalog';
import type { MergeQueueReadiness } from '../../domain/merge_queue_readiness';
import { redactSensitiveText } from '../../domain/security/sensitive_text';

export const MERGE_QUEUE_MESSAGE_IDS = Object.freeze([
  'mergeQueue.readiness.failure',
  'mergeQueue.readiness.incompleteEvidence',
  'mergeQueue.readiness.action.unsupported',
  'mergeQueue.readiness.action.observation',
  'mergeQueue.readiness.action.unknown',
  'mergeQueue.producerState.verified',
  'mergeQueue.producerState.attested',
  'mergeQueue.producerState.unknown',
  'mergeQueue.producerState.unsupported',
  'mergeQueue.problem.classicProtection',
  'mergeQueue.problem.effectiveRules',
  'mergeQueue.problem.workflowContract',
  'mergeQueue.problem.queueMembership',
  'mergeQueue.decision.explicitCreateOnly',
  'mergeQueue.decision.policyObservationFailed',
  'mergeQueue.decision.autoMergeRejected',
  'mergeQueue.decision.queueRequired',
  'mergeQueue.decision.queueNotExposed',
  'mergeQueue.decision.autoMergeConfigured',
  'mergeQueue.decision.autoMergeDisabled',
  'mergeQueue.decision.immediatelyMergeable',
  'mergeQueue.decision.autoMergeAvailable',
  'mergeQueue.decision.createOnlyRequired',
] as const);

export type MergeQueueMessageId = typeof MERGE_QUEUE_MESSAGE_IDS[number];

export interface MergeQueueMessageView {
  message(
    id: MergeQueueMessageId,
    variables?: Readonly<Record<string, string | number>>,
  ): string;
}

export const ENGLISH_MERGE_QUEUE_MESSAGES: Readonly<Record<MergeQueueMessageId, CatalogMessage>> = Object.freeze({
  'mergeQueue.readiness.failure': 'Merge queue readiness is {verdict} for {role} target {branch}. {details} {action}',
  'mergeQueue.readiness.incompleteEvidence': 'Required producer evidence is incomplete.',
  'mergeQueue.readiness.action.unsupported': 'Add {event} to the required workflow, then retry.',
  'mergeQueue.readiness.action.observation': 'Restore read access and a valid response for the target policy and workflows, then retry.',
  'mergeQueue.readiness.action.unknown': 'Make the required producer support merge groups or add an exact reviewed check attestation, then retry.',
  'mergeQueue.producerState.verified': 'supports merge groups',
  'mergeQueue.producerState.attested': 'covered by an exact reviewed attestation',
  'mergeQueue.producerState.unknown': 'support could not be verified',
  'mergeQueue.producerState.unsupported': 'does not support merge groups',
  'mergeQueue.problem.classicProtection': 'Classic branch protection could not be inspected.',
  'mergeQueue.problem.effectiveRules': 'Effective repository rules could not be inspected.',
  'mergeQueue.problem.workflowContract': 'Required workflow contracts could not be inspected.',
  'mergeQueue.problem.queueMembership': 'Merge-queue membership could not be inspected.',
  'mergeQueue.decision.explicitCreateOnly': 'Create-only mode was explicitly configured.',
  'mergeQueue.decision.policyObservationFailed': 'The target merge policy could not be verified.',
  'mergeQueue.decision.autoMergeRejected': 'Auto-merge mode was selected, but the target requires its merge queue.',
  'mergeQueue.decision.queueRequired': 'The target requires its merge queue.',
  'mergeQueue.decision.queueNotExposed': 'The target does not expose a required merge queue.',
  'mergeQueue.decision.autoMergeConfigured': 'Native auto-merge was explicitly configured.',
  'mergeQueue.decision.autoMergeDisabled': 'Native auto-merge is disabled for this repository.',
  'mergeQueue.decision.immediatelyMergeable': 'GitHub reports the pull request ready; native auto-merge preserves branch protection.',
  'mergeQueue.decision.autoMergeAvailable': 'GitHub will merge after checks and reviews complete.',
  'mergeQueue.decision.createOnlyRequired': 'Repository auto-merge is unavailable; maintainer merge is required.',
});

export const SPANISH_MERGE_QUEUE_MESSAGES: Readonly<Record<MergeQueueMessageId, CatalogMessage>> = Object.freeze({
  'mergeQueue.readiness.failure': 'La preparación de la merge queue está en estado {verdict} para el destino {role} {branch}. {details} {action}',
  'mergeQueue.readiness.incompleteEvidence': 'La evidencia del productor requerido está incompleta.',
  'mergeQueue.readiness.action.unsupported': 'Añade {event} al workflow requerido y vuelve a intentarlo.',
  'mergeQueue.readiness.action.observation': 'Restaura el acceso de lectura y una respuesta válida para la política y los workflows del destino, y vuelve a intentarlo.',
  'mergeQueue.readiness.action.unknown': 'Haz que el productor requerido soporte merge groups o añade una atestación exacta revisada y vuelve a intentarlo.',
  'mergeQueue.producerState.verified': 'admite merge groups',
  'mergeQueue.producerState.attested': 'está cubierto por una atestación exacta revisada',
  'mergeQueue.producerState.unknown': 'no se ha podido verificar su compatibilidad',
  'mergeQueue.producerState.unsupported': 'no admite merge groups',
  'mergeQueue.problem.classicProtection': 'No se ha podido inspeccionar la protección de rama clásica.',
  'mergeQueue.problem.effectiveRules': 'No se han podido inspeccionar las reglas efectivas del repositorio.',
  'mergeQueue.problem.workflowContract': 'No se han podido inspeccionar los contratos de los workflows requeridos.',
  'mergeQueue.problem.queueMembership': 'No se ha podido inspeccionar la pertenencia a la merge queue.',
  'mergeQueue.decision.explicitCreateOnly': 'El modo de solo creación se ha configurado explícitamente.',
  'mergeQueue.decision.policyObservationFailed': 'No se ha podido verificar la política de merge del destino.',
  'mergeQueue.decision.autoMergeRejected': 'Se ha seleccionado auto-merge, pero el destino requiere su merge queue.',
  'mergeQueue.decision.queueRequired': 'El destino requiere su merge queue.',
  'mergeQueue.decision.queueNotExposed': 'El destino no expone una merge queue obligatoria.',
  'mergeQueue.decision.autoMergeConfigured': 'El auto-merge nativo se ha configurado explícitamente.',
  'mergeQueue.decision.autoMergeDisabled': 'El auto-merge nativo está deshabilitado en este repositorio.',
  'mergeQueue.decision.immediatelyMergeable': 'GitHub indica que la pull request está lista; el auto-merge nativo preserva la protección de rama.',
  'mergeQueue.decision.autoMergeAvailable': 'GitHub hará merge cuando terminen los checks y las revisiones.',
  'mergeQueue.decision.createOnlyRequired': 'El auto-merge del repositorio no está disponible; se requiere el merge de una persona mantenedora.',
});

export function renderMergeQueueReadinessFailure(
  readiness: MergeQueueReadiness,
  catalog: MergeQueueMessageView,
): string {
  const failed = readiness.producers.filter((producer) =>
    producer.verdict === 'unsupported' || producer.verdict === 'unknown');
  const producerDetails = failed.slice(0, 5)
    .map((producer) => `${boundedMergeQueueDiagnostic(producer.name)} [${producer.verdict}]: ${catalog.message(producerStateMessageId(producer.verdict))}`)
    .join('; ');
  const problemDetails = readiness.problems.slice(0, 3)
    .map((problem) => `${problem.area}: ${catalog.message(problemMessageId(problem.area))}`)
    .join('; ');
  const details = [producerDetails, problemDetails].filter(Boolean).join('; ')
    || catalog.message('mergeQueue.readiness.incompleteEvidence');
  const unsupported = failed.some((producer) => producer.verdict === 'unsupported');
  const action = catalog.message(
    unsupported
      ? 'mergeQueue.readiness.action.unsupported'
      : readiness.problems.length > 0
        ? 'mergeQueue.readiness.action.observation'
        : 'mergeQueue.readiness.action.unknown',
    unsupported ? { event: 'merge_group: checks_requested' } : {},
  );
  return catalog.message('mergeQueue.readiness.failure', {
    verdict: readiness.verdict,
    role: readiness.targetRole,
    branch: boundedMergeQueueDiagnostic(readiness.targetBranch),
    details,
    action,
  });
}

export function producerStateMessageId(
  verdict: MergeQueueReadiness['producers'][number]['verdict'],
): MergeQueueMessageId {
  return `mergeQueue.producerState.${verdict}`;
}

function problemMessageId(
  area: MergeQueueReadiness['problems'][number]['area'],
): MergeQueueMessageId {
  const ids: Readonly<Record<typeof area, MergeQueueMessageId>> = {
    'classic-protection': 'mergeQueue.problem.classicProtection',
    'effective-rules': 'mergeQueue.problem.effectiveRules',
    'workflow-contract': 'mergeQueue.problem.workflowContract',
    'queue-membership': 'mergeQueue.problem.queueMembership',
  };
  return ids[area];
}

export function boundedMergeQueueDiagnostic(value: string): string {
  return redactSensitiveText(value)
    .replace(/[\r\n<>]/gu, ' ')
    .replace(/::/gu, '﹕﹕')
    .replace(/@/gu, '@\u200b')
    .slice(0, 500);
}
