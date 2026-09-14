import { Result } from '../../../data/model/result';
import { evaluateIssueInactivity, type IssueActivitySnapshot } from '../../../domain/issue_inactivity';
import type { BoundIssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { BoundIssueInactivityQueryPort, IssueInactivityClockPort } from '../../ports/issue_inactivity_ports';
import type { InactivityContext } from '../push_single_action_contexts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import { baseLanguage } from '../../../domain/locale';
import { buildPublicationMarker, createSemanticDigest } from '../../policies/publication_identity_policy';

export interface CloseInactiveIssuesWorkflowDependencies {
    readonly issueQueryPort: BoundIssueInactivityQueryPort;
    readonly issueClosurePort: BoundIssueClosurePort;
    readonly clock: IssueInactivityClockPort;
}

const TASK_ID = 'CloseInactiveIssuesUseCase';
/** Scans waiting issues and closes only candidates that remain inactive. */
export async function runCloseInactiveIssuesWorkflow(
    param: InactivityContext,
    dependencies: CloseInactiveIssuesWorkflowDependencies,
): Promise<Result[]> {
    const waitingLabels = unique([
        ...param.waitingLabels,
    ]);
    const activityLabel = param.activityLabel;
    const nowMilliseconds = dependencies.clock.nowMilliseconds();
    const thresholdHours = param.thresholdHours;

    try {
        const candidates = await listCandidates(param, waitingLabels, dependencies.issueQueryPort);
        let eligibleCount = 0;
        let closedCount = 0;
        let skippedCount = 0;
        const errors: ApplicationError[] = [];

        for (const candidate of candidates) {
            const initialDecision = evaluateIssueInactivity({
                issue: candidate,
                waitingLabels,
                agentActivityLabel: activityLabel,
                thresholdHours,
                nowMilliseconds,
            });
            if (initialDecision.kind !== 'close') {
                skippedCount++;
                continue;
            }
            eligibleCount++;

            try {
                // Re-read both labels and updated_at immediately before the
                // mutation so a comment or state transition during the scan
                // invalidates the stale list snapshot.
                const current = await dependencies.issueQueryPort.getOpenIssue(
                    candidate.number,
                );
                if (!current || evaluateIssueInactivity({
                    issue: current,
                    waitingLabels,
                    agentActivityLabel: activityLabel,
                    thresholdHours,
                    nowMilliseconds: dependencies.clock.nowMilliseconds(),
                }).kind !== 'close') {
                    skippedCount++;
                    continue;
                }

                const closed = await dependencies.issueClosurePort.closeIssue(
                    candidate.number,
                );
                if (!closed) {
                    skippedCount++;
                    continue;
                }
                closedCount++;
                await dependencies.issueClosurePort.addComment(
                    candidate.number,
                    buildInactivityExplanation(candidate, thresholdHours, param.locale),
                );
                logInfo(`Issue #${candidate.number} closed after inactivity.`);
            } catch (error) {
                const message = `Unable to close issue #${candidate.number} after inactivity.`;
                logError(message);
                errors.push(new ApplicationError('provider.unavailable', `${message} ${safeErrorMessage(error)}`, { cause: error }));
            }
        }

        logDebugInfo(
            `${TASK_ID}: scanned=${candidates.length}, eligible=${eligibleCount}, closed=${closedCount}, skipped=${skippedCount}.`,
        );
        return [new Result({
            id: TASK_ID,
            success: errors.length === 0,
            executed: closedCount > 0 || eligibleCount > 0,
            steps: buildSteps(candidates.length, closedCount, skippedCount),
            payload: {
                scanned: candidates.length,
                eligible: eligibleCount,
                closed: closedCount,
                skipped: skippedCount,
            },
            errors,
        })];
    } catch (error) {
        const message = 'Unable to scan issues for inactivity closure.';
        logError(message);
        return [new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            steps: [message],
            errors: [toApplicationError(error, 'provider.unavailable', `${message} ${safeErrorMessage(error)}`)],
        })];
    }
}

function buildInactivityExplanation(
    candidate: IssueActivitySnapshot,
    thresholdHours: number,
    locale: string,
): string {
    const digest = createSemanticDigest({ updatedAt: candidate.updatedAt, thresholdHours });
    const marker = buildPublicationMarker({
        identity: { topic: 'inactivity', target: { kind: 'issue', number: candidate.number }, key: 'closure' },
        sourceVersion: `policy:${digest}`,
        digest,
    });
    if (baseLanguage(locale) === 'es') {
        return [
            marker,
            '',
            '## Issue cerrada por inactividad',
            '',
            `No se detectó actividad durante al menos **${thresholdHours} horas** mientras esta issue esperaba una respuesta.`,
            '',
            'Si todavía necesita atención, vuelve a abrirla y añade un comentario con el contexto actualizado.',
        ].join('\n');
    }
    return [
        marker,
        '',
        '## Issue closed after inactivity',
        '',
        `No activity was detected for at least **${thresholdHours} hours** while this issue was waiting for a response.`,
        '',
        'If it still needs attention, reopen it and add a comment with the current context.',
    ].join('\n');
}

async function listCandidates(
    _param: InactivityContext,
    waitingLabels: readonly string[],
    queryPort: BoundIssueInactivityQueryPort,
): Promise<IssueActivitySnapshot[]> {
    const candidates: IssueActivitySnapshot[] = [];
    for (const label of waitingLabels) {
        candidates.push(...await queryPort.listOpenIssuesByLabel(label));
    }

    const uniqueCandidates = new Map<number, IssueActivitySnapshot>();
    for (const candidate of candidates) uniqueCandidates.set(candidate.number, candidate);
    return [...uniqueCandidates.values()];
}

function buildSteps(scanned: number, closed: number, skipped: number): string[] {
    const steps = [`Scanned ${scanned} open issue(s) waiting for a response.`];
    if (closed > 0) steps.push(`Closed ${closed} issue(s) after the inactivity threshold.`);
    if (skipped > 0) steps.push(`Skipped ${skipped} candidate(s) because they were no longer eligible.`);
    if (closed === 0) steps.push('No issue was closed for inactivity.');
    return steps;
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function safeErrorMessage(_error: unknown): string {
    return 'The issue provider request failed.';
}
