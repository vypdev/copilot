import type { ApprovalDecision, ApprovalEvidence } from '../../domain/pull_request_approval';
import type { ApprovalObservationTarget } from '../ports/pull_request_approval_ports';

export interface ApprovalPresentationInput {
    readonly target: ApprovalObservationTarget;
    readonly evidence: ApprovalEvidence;
    readonly decision: ApprovalDecision;
    readonly reviewId?: number;
    readonly locale: string;
}

/** One bounded, text-first card. No PR prose or provider response is rendered. */
export function renderApprovalAssessment(input: ApprovalPresentationInput): string {
    const spanish = input.locale.toLowerCase().startsWith('es');
    const { evidence, decision, target } = input;
    const url = `https://github.com/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}/pull/${target.pullNumber}`;
    const approved = decision.code === 'approved' || decision.status === 'already-approved';
    const partial = decision.code === 'publication-unknown';
    const status = approved ? (spanish ? 'Aprobada por el bot' : 'Approved by the bot')
        : partial ? (spanish ? 'Resultado de publicación incierto' : 'Publication outcome uncertain')
            : decision.status === 'pending' ? (spanish ? 'Esperando evidencias' : 'Waiting for evidence')
                : decision.status === 'recommend' ? (spanish ? 'Revisión humana necesaria' : 'Human review needed')
                    : (spanish ? 'Aprobación bloqueada' : 'Approval blocked');
    const action = approved ? (spanish ? 'Ninguna; GitHub seguirá aplicando sus reglas.' : 'None; GitHub still applies its review rules.')
        : partial ? (spanish ? 'Reejecuta el observador; comprobará la revisión antes de intentar publicarla otra vez.'
            : 'Rerun the observer; it reads the review before any retry.')
            : decision.status === 'pending' ? (spanish ? 'Espera al productor pendiente o reejecuta el observador.'
                : 'Wait for the pending producer or rerun the observer.')
                : decision.status === 'recommend' ? (spanish ? 'Pide una decisión a una persona revisora.'
                    : 'Ask a human reviewer to decide.')
                    : (spanish ? 'Corrige el requisito indicado y reejecuta el observador.'
                        : 'Fix the named prerequisite and rerun the observer.');
    const completed = evidence.checks.filter(check => check.status === 'completed' && check.conclusion === 'success').length;
    const selected = evidence.checks.length;
    const bugbot = evidence.bugbot?.headSha === evidence.headSha && evidence.bugbot.outcome === 'complete'
        && evidence.bugbot.coverage === 'complete';
    const detail = spanish ? spanishDecisionReason(decision.code) : escapeMarkdown(decision.detail);
    const lines = [
        '<!-- copilot:approval-assessment:v1 -->',
        `### ${spanish ? 'Aprobación de Copilot' : 'Copilot approval'} · ${status}`,
        `**${spanish ? 'Estado' : 'Status'}:** ${detail}`,
        `**${spanish ? 'Completado' : 'Completed'}:** ${completed}/${selected} ${spanish ? 'checks observados correctos' : 'observed checks succeeded'}; Bugbot ${bugbot ? (spanish ? 'completo' : 'complete') : (spanish ? 'no verificado' : 'unverified')}.`,
        `**${spanish ? 'Acción necesaria' : 'Action required'}:** ${action}`,
        `**${spanish ? 'Impacto' : 'Impact'}:** ${approved
            ? (spanish ? 'Hay una revisión nativa para esta revisión; no se ha fusionado la PR.' : 'A native review exists for this revision; the PR was not merged.')
            : (spanish ? 'No se ha confirmado ninguna aprobación nueva para esta revisión.' : 'No new approval is confirmed for this revision.')}`,
        input.reviewId ? `[${spanish ? 'Abrir aprobación' : 'Open approval'}](${url}#pullrequestreview-${input.reviewId}) · [${spanish ? 'Ver checks' : 'See checks'}](${url}/checks)`
            : `[${spanish ? 'Ver checks' : 'See checks'}](${url}/checks)`,
        '<details>',
        `<summary>${spanish ? 'Evidencia técnica' : 'Technical evidence'}</summary>`,
        `${spanish ? 'Revisión' : 'Revision'}: \`${evidence.headSha.slice(0, 12)}\`; base: \`${evidence.baseSha.slice(0, 12)}\`; ${spanish ? 'motivo' : 'reason'}: \`${escapeMarkdown(decision.code)}\`.`,
        '</details>',
    ];
    return lines.join('\n').slice(0, 1800);
}

const SPANISH_DECISION_REASONS: Readonly<Record<string, string>> = Object.freeze({
    disabled: 'La aprobación automática está desactivada.',
    'unsupported-pr': 'Solo se evalúan PRs abiertas, no borrador, completas y del mismo repositorio.',
    scope: 'La PR queda fuera del ámbito de aprobación configurado.',
    'bot-author': 'Una persona debe revisar las PRs abiertas por bots.',
    'protected-path': 'Ha cambiado un archivo protegido de workflow, política o seguridad.',
    'bugbot-ignored-path': 'Bugbot omitió un archivo modificado; su resultado no permite aprobar.',
    'unsafe-rules': 'Las reglas de rama deben ser legibles y descartar aprobaciones antiguas.',
    'producer-unattested': 'Falta la confirmación del productor de CI y del paso obligatorio de cobertura.',
    'reporter-unattested': 'No se ha confirmado la instalación del reporter numérico en CI de confianza.',
    'merge-ref-unavailable': 'Se espera una fusión de prueba verificada para la base y revisión actuales.',
    'approval-check-cycle': 'El check Copilot / Approval no puede exigirse a sí mismo.',
    'bugbot-configuration': 'Bugbot debe usar severidad info y tener desactivado dry-run.',
    'check-producer-unconfigured': 'Falta configurar un productor de confianza para un check obligatorio.',
    'check-missing': 'Se espera un check de la revisión actual.',
    'check-source': 'El origen de un check difiere del productor configurado.',
    'check-ambiguous': 'Hay intentos recientes ambiguos para un check.',
    'check-pending': 'Se espera a que termine un check.',
    'check-failed': 'Un check obligatorio no terminó correctamente.',
    'bugbot-missing': 'Se espera una revisión completa de Bugbot para esta revisión.',
    'bugbot-incomplete': 'La evidencia de Bugbot es parcial, fallida u obsoleta.',
    'bugbot-findings': 'Bugbot tiene hallazgos abiertos, desconocidos o descartados que bloquean.',
    'coverage-evidence': 'Falta evidencia numérica válida para la revisión actual.',
    'coverage-low': 'La cobertura del diff no alcanza el umbral configurado.',
    'reviews-unavailable': 'No se pudo leer todo el historial de revisiones.',
    'existing-approval': 'El bot ya aprobó esta revisión exacta.',
    'approval-dismissed': 'Una persona responsable descartó la aprobación del bot para esta revisión.',
    'changes-requested': 'Una persona revisora ha solicitado cambios.',
    'human-approved': 'Una persona ya aprobó esta revisión.',
    'recommend-mode': 'Las evidencias cumplen; una persona debe decidir.',
    eligible: 'Las evidencias y reglas permiten una aprobación nativa.',
    approved: 'El bot aprobó esta revisión; GitHub sigue aplicando las reglas de rama.',
    'publication-unknown': 'GitHub podría haber aceptado la revisión; reejecuta para comprobarla.',
    'invalid-policy': 'La política instalada no es válida; ejecuta copilot doctor.',
    'evidence-unavailable': 'No se pudo leer la evidencia de aprobación; reejecuta el observador.',
    'target-mismatch': 'La PR resuelta no coincide con el repositorio y número esperados.',
    'pre-submit-unavailable': 'No se pudo volver a leer la evidencia antes de publicar la aprobación.',
    superseded: 'La política o revisión cambió; vuelve a comprobar la revisión actual.',
});

function spanishDecisionReason(code: string): string {
    return SPANISH_DECISION_REASONS[code] ?? 'No se pudo completar la evaluación de aprobación.';
}

export function renderApprovalRunSummary(input: ApprovalPresentationInput & {
    readonly mode: string;
    readonly publication: string;
    readonly wakeup: string;
}): string {
    const spanish = input.locale.toLowerCase().startsWith('es');
    const checks = input.evidence.checks.slice(0, 8).map(check =>
        `- \`${escapeMarkdown(check.name)}\` · App ${check.sourceAppId} · \`${escapeMarkdown(check.workflowName)}\` · ${escapeMarkdown(check.status)}/${escapeMarkdown(check.conclusion ?? 'unknown')} · run ${check.runId}/${check.attempt}`);
    return [
        `### ${spanish ? 'Observación de aprobación' : 'Approval observation'} · PR #${input.target.pullNumber}`,
        `- ${spanish ? 'Inicio' : 'Wakeup'}: ${escapeMarkdown(input.wakeup)}`,
        `- ${spanish ? 'Modo' : 'Mode'}: \`${escapeMarkdown(input.mode)}\`; ${spanish ? 'resultado' : 'result'}: \`${escapeMarkdown(input.decision.status)}\` (\`${escapeMarkdown(input.decision.code)}\`)`,
        `- ${spanish ? 'Revisión/base' : 'Head/base'}: \`${input.evidence.headSha}\` / \`${input.evidence.baseSha}\``,
        `- Bugbot: ${escapeMarkdown(input.evidence.bugbot?.outcome ?? 'missing')}/${escapeMarkdown(input.evidence.bugbot?.coverage ?? 'missing')}`,
        `- ${spanish ? 'Revisión nativa' : 'Native review'}: ${input.reviewId ?? (spanish ? 'ninguna confirmada' : 'none confirmed')}`,
        `- ${spanish ? 'Tarjeta/Check' : 'Card/Check'}: ${escapeMarkdown(input.publication)}`,
        ...(checks.length > 0 ? [spanish ? 'Productores observados:' : 'Observed producers:', ...checks] : []),
        `- ${spanish ? 'Recuperación' : 'Recovery'}: ${spanish ? 'corrige el bloqueo y reejecuta Copilot - Pull Request Approval con el número de PR' : 'fix the blocker and rerun Copilot - Pull Request Approval with the PR number'}.`,
    ].join('\n');
}

function escapeMarkdown(value: string): string {
    return [...value].map(character => character === '@' ? '@\u200b'
        : '\\`*_{}[]()#+.!|>~-<>'.includes(character) ? `\\${character}` : character).join('');
}
