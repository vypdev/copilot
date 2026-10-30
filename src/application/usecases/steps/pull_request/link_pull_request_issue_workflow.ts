import { randomUUID } from 'node:crypto';
import { Result } from '../../../../data/model/result';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import type { BoundPullRequestIssueLinkPort, PullRequestLinkDetails } from '../../../ports/pull_request_issue_link_ports';
import type { LinkPullRequestIssueContext } from '../../pull_request_workflow_context';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';
import { isSafeBranchTree } from '../../../../domain/deployment_configuration';
import { ApplicationError } from '../../../errors/application_error';
import { attachPendingPullRequestLink, createPendingPullRequestLink, isOpenPullRequestLinkIdentity,
    readPendingPullRequestLink, removePendingPullRequestLink,
    type PullRequestLinkIdentity } from '../../../../domain/pull_request_issue_link_state';

export class PullRequestIssueLinkOperationError extends Error {
    constructor(readonly retainedBaseBranch: boolean, readonly retainedIssueReference: boolean, readonly primaryError?: unknown) {
        super('Unable to complete pull-request issue linkage with fully restored provider state.');
        this.name = 'PullRequestIssueLinkOperationError';
    }
}

/** Recover metadata first, including after process death and a newer head. */
export async function runLinkPullRequestIssue(
    param: LinkPullRequestIssueContext, taskId: string,
    port: BoundPullRequestIssueLinkPort, delay: EventualConsistencyDelayPort,
): Promise<Result[]> {
    const pr = parsePositiveSafeInteger(param.pullRequestNumber);
    const issue = parsePositiveSafeInteger(param.issueNumber);
    if (!pr) return invalid(taskId, 'Pull-request linkage requires a positive pull-request number.');
    if (!issue || issue === pr) return [new Result({ id: taskId, success: true, executed: false,
        steps: ['No separate linked issue was inferred; pull-request linkage was skipped.'] })];
    if (!isSafeBranchTree(param.originalBaseBranch) || !isSafeBranchTree(param.defaultBranch)) {
        return invalid(taskId, 'Pull-request linkage requires a positive issue number and safe non-empty base branches.');
    }
    let current = await port.getDetails(pr);
    const identity = requireIdentity(current, pr);
    if ((param.expectedHeadRepository && param.expectedHeadRepository !== identity.headRepository)
        || (param.expectedHeadRef && param.expectedHeadRef !== identity.headRef)) throw stale();
    const state = readPendingPullRequestLink(current.body);
    if (state.kind === 'blocked') throw new PullRequestIssueLinkOperationError(true, true);
    if (state.kind === 'pending' && (identity.headRepository !== identity.repository
        || state.record.pullRequestNumber !== pr || state.record.issueNumber !== issue
        || (state.record.version === 2 && (state.record.headRepository !== identity.headRepository
            || state.record.headRef !== identity.headRef)))) throw new PullRequestIssueLinkOperationError(true, true);
    const original = state.kind === 'pending' ? state.record.originalBaseBranch : param.originalBaseBranch;
    if (state.kind === 'pending' && param.originalBaseBranch !== param.defaultBranch
        && param.originalBaseBranch !== original) throw new PullRequestIssueLinkOperationError(true, true);
    if (state.kind === 'none' && param.expectedHeadSha && param.expectedHeadSha !== identity.headSha) throw stale();
    if (current.baseBranch !== original && !(state.kind === 'pending' && current.baseBranch === param.defaultBranch)) {
        throw stale();
    }
    if (state.kind === 'none' && param.recoveryOnly) return [];
    let marker = state.kind === 'pending' ? state.marker : undefined;
    let primaryError: unknown;
    let linkageObserved = false;
    const obsoleteEvent = Boolean(param.expectedHeadSha && param.expectedHeadSha !== identity.headSha);
    if (!marker) {
        if (await port.isLinked(pr, issue)) return [];
        const fresh = await port.getDetails(pr);
        requireSame(fresh, identity, pr, true);
        if (fresh.body !== current.body || fresh.baseBranch !== original) throw stale();
        current = fresh;
        marker = createPendingPullRequestLink({ pullRequestNumber: pr, issueNumber: issue,
            originalBaseBranch: original, operationId: randomUUID(), headRepository: identity.headRepository,
            headRef: identity.headRef, headSha: identity.headSha });
        try {
            await port.updateDescription(pr, attachPendingPullRequestLink(current.body, marker));
            current = await inspectOwned(port, pr, identity, marker, true);
            if (current.baseBranch !== original) throw stale();
            if (original !== param.defaultBranch) {
                await port.updateBaseBranch(pr, param.defaultBranch);
                current = await inspectOwned(port, pr, identity, marker, true);
                if (current.baseBranch !== param.defaultBranch) throw stale();
            }
            await delay.wait(20_000);
            linkageObserved = await port.isLinked(pr, issue);
        } catch (cause) { primaryError = cause; }
    } else {
        try {
            linkageObserved = await port.isLinked(pr, issue);
            if (!linkageObserved) {
                if (obsoleteEvent) throw stale();
                current = await inspectOwned(port, pr, identity, marker, true);
                if (![original, param.defaultBranch].includes(current.baseBranch)) throw stale();
                if (current.baseBranch !== param.defaultBranch) {
                    await port.updateBaseBranch(pr, param.defaultBranch);
                    current = await inspectOwned(port, pr, identity, marker, true);
                    if (current.baseBranch !== param.defaultBranch) throw stale();
                }
                await delay.wait(20_000);
                linkageObserved = await port.isLinked(pr, issue);
            }
        } catch (cause) { primaryError = cause; }
    }
    // Never restore an old whole body. Each mutation uses freshly observed native
    // identity and the exact operation lease; retain it if base restoration fails.
    let baseRestored = false;
    let referenceRemoved = false;
    let headAdvanced: boolean;
    try {
        current = await port.getDetails(pr);
        requireSame(current, identity, pr, false);
        headAdvanced = current.identity!.headSha !== identity.headSha;
        const pending = readPendingPullRequestLink(current.body);
        if (pending.kind === 'none' && current.baseBranch === original) {
            baseRestored = true;
            referenceRemoved = true;
        } else {
            requireOwned(current, marker);
            if (![original, param.defaultBranch].includes(current.baseBranch)) throw stale();
            if (current.baseBranch !== original) {
                await port.updateBaseBranch(pr, original);
                current = await inspectOwned(port, pr, identity, marker, false);
            }
            if (current.baseBranch !== original) throw stale();
            baseRestored = true;
            if (!linkageObserved) throw new Error('The intended PR-to-issue relationship is not verified.');
            await port.updateDescription(pr, removePendingPullRequestLink(current.body, marker));
            baseRestored = false;
            current = await port.getDetails(pr);
            requireSame(current, identity, pr, false);
            baseRestored = current.baseBranch === original;
            if (!baseRestored || readPendingPullRequestLink(current.body).kind !== 'none') throw stale();
            referenceRemoved = true;
            headAdvanced ||= current.identity!.headSha !== identity.headSha;
        }
    } catch { throw new PullRequestIssueLinkOperationError(!baseRestored, !referenceRemoved, primaryError); }
    if (primaryError !== undefined) {
        if (primaryError instanceof ApplicationError) throw primaryError;
        throw new PullRequestIssueLinkOperationError(false, false);
    }
    if (headAdvanced || (param.expectedHeadSha && param.expectedHeadSha !== current.identity!.headSha)) throw stale();
    return [new Result({ id: taskId, success: true, executed: true,
        steps: ['The intended issue relationship and original pull-request base were verified; the owned temporary reference was removed.'] })];
}
function requireIdentity(details: PullRequestLinkDetails, pr: number): PullRequestLinkIdentity {
    if (!isOpenPullRequestLinkIdentity(details.identity, pr)) throw stale();
    return details.identity;
}
function requireSame(details: PullRequestLinkDetails, identity: PullRequestLinkIdentity, pr: number, pinSha: boolean): void {
    const fresh = requireIdentity(details, pr);
    if (fresh.headRepository !== identity.headRepository || fresh.headRef !== identity.headRef
        || (pinSha && fresh.headSha !== identity.headSha)) throw stale();
}
function requireOwned(details: PullRequestLinkDetails, marker: string): void {
    const state = readPendingPullRequestLink(details.body);
    if (state.kind !== 'pending' || state.marker !== marker) throw stale();
}
async function inspectOwned(port: BoundPullRequestIssueLinkPort, pr: number, identity: PullRequestLinkIdentity,
    marker: string, pinSha: boolean): Promise<PullRequestLinkDetails> {
    const fresh = await port.getDetails(pr);
    requireSame(fresh, identity, pr, pinSha);
    requireOwned(fresh, marker);
    return fresh;
}
function stale(): ApplicationError {
    return new ApplicationError('workflow.stale', 'PR linkage identity, base or operation changed. Recovery state was retained; rerun the current PR workflow before enrichment.');
}
function invalid(id: string, step: string): Result[] {
    return [new Result({ id, success: false, executed: false, steps: [step] })];
}
