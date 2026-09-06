import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { evaluateIssueInactivity, type IssueActivitySnapshot } from '../../../domain/issue_inactivity';
import type { IssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { IssueInactivityClockPort, IssueInactivityQueryPort } from '../../ports/issue_inactivity_ports';
import { sanitizePublishedError } from '../../policies/github_comment_publication_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';

export interface CloseInactiveIssuesWorkflowDependencies {
    readonly issueQueryPort: IssueInactivityQueryPort;
    readonly issueClosurePort: IssueClosurePort;
    readonly clock: IssueInactivityClockPort;
}

const TASK_ID = 'CloseInactiveIssuesUseCase';
const INACTIVITY_COMMENT = (thresholdHours: number): string =>
    `This issue was automatically closed due to inactivity while waiting for a response. No activity was detected for at least **${thresholdHours} hours**. Reopen it and add a comment if it still needs attention.`;

/** Scans waiting issues and closes only candidates that remain inactive. */
export async function runCloseInactiveIssuesWorkflow(
    param: Execution,
    dependencies: CloseInactiveIssuesWorkflowDependencies,
): Promise<Result[]> {
    const waitingLabels = unique([
        param.labels.lifecycle.awaitingMaintainer,
        param.labels.lifecycle.awaitingIssueAuthor,
    ]);
    const activityLabel = param.labels.lifecycle.aiProcessing;
    const nowMilliseconds = dependencies.clock.nowMilliseconds();
    const thresholdHours = param.inactivityThresholdHours;

    try {
        const candidates = await listCandidates(param, waitingLabels, dependencies.issueQueryPort);
        let eligibleCount = 0;
        let closedCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];

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
                    param.owner,
                    param.repo,
                    candidate.number,
                    param.tokens.token,
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
                    param.owner,
                    param.repo,
                    candidate.number,
                    param.tokens.token,
                );
                if (!closed) {
                    skippedCount++;
                    continue;
                }
                closedCount++;
                await dependencies.issueClosurePort.addComment(
                    param.owner,
                    param.repo,
                    candidate.number,
                    INACTIVITY_COMMENT(thresholdHours),
                    param.tokens.token,
                );
                logInfo(`Issue #${candidate.number} closed after inactivity.`);
            } catch (error) {
                const message = `Unable to close issue #${candidate.number} after inactivity.`;
                logError(message);
                errors.push(`${message} ${safeErrorMessage(error)}`);
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
            errors: [`${message} ${safeErrorMessage(error)}`],
        })];
    }
}

async function listCandidates(
    param: Execution,
    waitingLabels: readonly string[],
    queryPort: IssueInactivityQueryPort,
): Promise<IssueActivitySnapshot[]> {
    const candidates: IssueActivitySnapshot[] = [];
    for (const label of waitingLabels) {
        candidates.push(...await queryPort.listOpenIssuesByLabel(
            param.owner,
            param.repo,
            label,
            param.tokens.token,
        ));
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

function safeErrorMessage(error: unknown): string {
    const message = sanitizePublishedError(error instanceof Error ? error.message : error);
    return message || 'Unknown provider error.';
}
