import { Result } from '../../../data/model/result';
import { evaluateIssueInactivity, type IssueActivitySnapshot } from '../../../domain/issue_inactivity';
import type { BoundIssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { BoundIssueInactivityQueryPort, IssueInactivityClockPort } from '../../ports/issue_inactivity_ports';
import type { InactivityContext } from '../push_single_action_contexts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';
import {
    resolveInactivityCatalog,
    resolveStaticInactivityCatalog,
} from '../../policies/inactivity_message_catalog';
import {
    buildInactivityClosureComment,
    buildInactivitySummarySteps,
} from '../../policies/inactivity_notification_policy';

export interface CloseInactiveIssuesWorkflowDependencies {
    readonly issueQueryPort: BoundIssueInactivityQueryPort;
    readonly issueClosurePort: BoundIssueClosurePort;
    readonly clock: IssueInactivityClockPort;
    readonly catalogResolver?: MessageCatalogResolutionPort;
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
    let resultMessages = resolveStaticInactivityCatalog(param.repositoryLocale);

    try {
        const commentMessages = await resolveInactivityCatalog(
            param.locale,
            param.agentConfiguration,
            dependencies.catalogResolver,
        );
        resultMessages = param.repositoryLocale === param.locale
            ? commentMessages
            : await resolveInactivityCatalog(
                param.repositoryLocale,
                param.agentConfiguration,
                dependencies.catalogResolver,
            );
        const candidates = await listCandidates(param, waitingLabels, dependencies.issueQueryPort);
        let eligibleCount = 0;
        let closedCount = 0;
        let commentedCount = 0;
        let commentFailureCount = 0;
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

            let current: IssueActivitySnapshot | undefined;
            try {
                // Re-read both labels and updated_at immediately before the
                // mutation so a comment or state transition during the scan
                // invalidates the stale list snapshot.
                current = await dependencies.issueQueryPort.getOpenIssue(
                    candidate.number,
                );
            } catch (error) {
                const message = resultMessages.message('inactivity.error.revalidate', {
                    issueNumber: candidate.number,
                });
                logError(message);
                errors.push(new ApplicationError('provider.unavailable', message, { cause: error }));
                continue;
            }
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

            try {
                const closed = await dependencies.issueClosurePort.closeIssue(candidate.number);
                if (!closed) {
                    skippedCount++;
                    continue;
                }
                closedCount++;
            } catch (error) {
                const message = resultMessages.message('inactivity.error.close', {
                    issueNumber: candidate.number,
                });
                logError(message);
                errors.push(new ApplicationError('provider.unavailable', message, { cause: error }));
                continue;
            }

            try {
                await dependencies.issueClosurePort.addComment(
                    candidate.number,
                    buildInactivityClosureComment({
                        candidate,
                        thresholdHours,
                        messages: commentMessages,
                    }),
                );
                commentedCount++;
                logInfo(`Issue #${candidate.number} closed after inactivity.`);
            } catch (error) {
                commentFailureCount++;
                const message = resultMessages.message('inactivity.error.comment', {
                    issueNumber: candidate.number,
                });
                logError(message);
                errors.push(new ApplicationError('provider.unavailable', message, {
                    cause: error,
                    retryable: false,
                    impact: resultMessages.message('inactivity.error.commentImpact', {
                        issueNumber: candidate.number,
                    }),
                    action: resultMessages.message('inactivity.error.commentAction', {
                        issueNumber: candidate.number,
                    }),
                    retainedState: resultMessages.message(
                        'inactivity.error.commentRetainedState',
                        { issueNumber: candidate.number },
                    ),
                }));
            }
        }

        logDebugInfo(
            `${TASK_ID}: scanned=${candidates.length}, eligible=${eligibleCount}, closed=${closedCount}, skipped=${skippedCount}.`,
        );
        return [new Result({
            id: TASK_ID,
            success: errors.length === 0,
            executed: closedCount > 0 || eligibleCount > 0,
            steps: buildInactivitySummarySteps({
                scanned: candidates.length,
                closed: closedCount,
                skipped: skippedCount,
                messages: resultMessages,
            }),
            payload: {
                scanned: candidates.length,
                eligible: eligibleCount,
                closed: closedCount,
                commented: commentedCount,
                commentFailures: commentFailureCount,
                failures: errors.length,
                skipped: skippedCount,
            },
            errors,
        })];
    } catch (error) {
        const message = resultMessages.message('inactivity.error.scan');
        logError(message);
        return [new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            steps: [message],
            errors: [toApplicationError(error, 'provider.unavailable', message)],
        })];
    }
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

function unique(values: readonly string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
