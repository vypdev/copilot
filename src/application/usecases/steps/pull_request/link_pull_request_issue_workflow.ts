import { Result } from '../../../../data/model/result';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import type { BoundPullRequestIssueLinkPort } from '../../../ports/pull_request_issue_link_ports';
import type { LinkPullRequestIssueContext } from '../../pull_request_workflow_context';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';
import { isSafeBranchTree } from '../../../../domain/deployment_configuration';

const LINK_MARKER_PREFIX = '<!-- copilot:pr-issue-link:v1';

export class PullRequestIssueLinkOperationError extends Error {
    readonly retainedBaseBranch: boolean;
    readonly retainedIssueReference: boolean;

    constructor(retainedBaseBranch: boolean, retainedIssueReference: boolean) {
        super('Unable to complete pull-request issue linkage with fully restored provider state.');
        this.name = 'PullRequestIssueLinkOperationError';
        this.retainedBaseBranch = retainedBaseBranch;
        this.retainedIssueReference = retainedIssueReference;
    }
}

/**
 * Establishes the GitHub PR-to-issue relationship and restores all temporary
 * provider state. The pending marker makes an interrupted operation resumable
 * from the same immutable webhook payload without trusting an event URL.
 */
export async function runLinkPullRequestIssue(
    param: LinkPullRequestIssueContext,
    taskId: string,
    port: BoundPullRequestIssueLinkPort,
    delay: EventualConsistencyDelayPort,
): Promise<Result[]> {
    if (!parsePositiveSafeInteger(param.pullRequestNumber)
        || !parsePositiveSafeInteger(param.issueNumber)
        || !isSafeBranchTree(param.originalBaseBranch)
        || !isSafeBranchTree(param.defaultBranch)) {
        return [new Result({
            id: taskId,
            success: false,
            executed: false,
            steps: ['Pull-request linkage requires positive issue/PR numbers and safe non-empty base branches.'],
        })];
    }
    const pendingMarker = buildPendingMarker(param);
    const details = await port.getDetails(param.pullRequestNumber);
    const pendingOperation = inspectPendingOperation(details.body, param, pendingMarker);
    if (pendingOperation.kind === 'blocked') {
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: [pendingOperation.step],
        })];
    }
    if (pendingOperation.kind === 'none' && details.baseBranch !== param.originalBaseBranch) {
        return [new Result({
            id: taskId,
            success: false,
            executed: false,
            steps: ['The pull-request base changed after this event. No linkage state was changed; rerun from the current PR state.'],
        })];
    }
    if (pendingOperation.kind === 'recoverable'
        && ![param.originalBaseBranch, param.defaultBranch].includes(details.baseBranch)) {
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['The pending linkage operation no longer matches the current PR base. The temporary description remains; restore the base and description in GitHub, then rerun.'],
        })];
    }
    const hasOwnedPendingOperation = pendingOperation.kind === 'recoverable';
    const originalBody = hasOwnedPendingOperation ? pendingOperation.originalBody : details.body;
    const results: Result[] = [];
    let temporaryDescriptionApplied = hasOwnedPendingOperation;
    let temporaryBaseApplied = hasOwnedPendingOperation && details.baseBranch === param.defaultBranch;
    let observationWindowCompleted = false;
    let primaryError: unknown;
    const restorationErrors: unknown[] = [];
    let retainedBaseBranch = false;
    let retainedIssueReference = false;
    let alreadyLinked = false;

    if (!hasOwnedPendingOperation) {
        alreadyLinked = await port.isLinked(param.pullRequestNumber);
        if (alreadyLinked) return [];
    } else {
        try {
            alreadyLinked = await port.isLinked(param.pullRequestNumber);
        } catch (error) {
            primaryError = error;
        }
    }

    try {
        if (primaryError === undefined && !temporaryDescriptionApplied) {
            await port.updateDescription(
                param.pullRequestNumber,
                appendTemporaryLink(originalBody, param.issueNumber, pendingMarker),
            );
            temporaryDescriptionApplied = true;
            results.push(success(taskId, `The description temporarily referenced issue **#${param.issueNumber}**.`));
        }
        if (primaryError === undefined && !temporaryBaseApplied && details.baseBranch !== param.defaultBranch) {
            await port.updateBaseBranch(param.pullRequestNumber, param.defaultBranch);
            temporaryBaseApplied = true;
            results.push(success(taskId, `The base branch was temporarily updated to \`${param.defaultBranch}\`.`));
        }
        if (primaryError === undefined) {
            if (!alreadyLinked) await delay.wait(20_000);
            observationWindowCompleted = true;
        }
    } catch (error) {
        primaryError = error;
    } finally {
        if (temporaryBaseApplied) {
            try {
                await port.updateBaseBranch(param.pullRequestNumber, param.originalBaseBranch);
                results.push(success(taskId, `The base branch was restored to \`${param.originalBaseBranch}\`.`));
            } catch (error) {
                restorationErrors.push(error);
                retainedBaseBranch = true;
            }
        }
        if (temporaryDescriptionApplied) {
            try {
                await port.updateDescription(
                    param.pullRequestNumber,
                    originalBody,
                );
                results.push(success(
                    taskId,
                    observationWindowCompleted
                        ? 'The original pull-request description was restored.'
                        : 'The temporary issue reference was removed during compensation.',
                ));
            } catch (error) {
                restorationErrors.push(error);
                retainedIssueReference = true;
            }
        }
    }
    if (restorationErrors.length > 0 || primaryError !== undefined) {
        throw new PullRequestIssueLinkOperationError(retainedBaseBranch, retainedIssueReference);
    }
    return results;
}

function buildPendingMarker(param: LinkPullRequestIssueContext): string {
    return `${LINK_MARKER_PREFIX};pr=${param.pullRequestNumber};issue=${param.issueNumber};base=${encodeURIComponent(param.originalBaseBranch)};state=pending -->`;
}

function appendTemporaryLink(body: string, issueNumber: number, marker: string): string {
    return `${body}${temporaryLinkSuffix(issueNumber, marker)}`;
}

function inspectPendingOperation(
    body: string,
    param: LinkPullRequestIssueContext,
    expectedMarker: string,
): { readonly kind: 'none' }
    | { readonly kind: 'recoverable'; readonly originalBody: string }
    | { readonly kind: 'blocked'; readonly step: string } {
    const operationPrefix = `${LINK_MARKER_PREFIX};pr=${param.pullRequestNumber};issue=${param.issueNumber};`;
    if (!body.includes(operationPrefix)) return { kind: 'none' };
    const suffix = temporaryLinkSuffix(param.issueNumber, expectedMarker);
    if (!body.endsWith(suffix)) {
        return {
            kind: 'blocked',
            step: 'A same-operation linkage marker is present but does not match the validated original base and temporary suffix. No new provider state was changed; inspect the PR body and base before rerunning.',
        };
    }
    return { kind: 'recoverable', originalBody: body.slice(0, -suffix.length) };
}

function temporaryLinkSuffix(issueNumber: number, marker: string): string {
    return `\n\nResolves #${issueNumber}\n\n${marker}`;
}

function success(taskId: string, step: string): Result {
    return new Result({ id: taskId, success: true, executed: true, steps: [step] });
}
