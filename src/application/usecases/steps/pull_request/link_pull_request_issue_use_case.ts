import { Result } from '../../../../data/model/result';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import type { BoundPullRequestIssueLinkPort } from '../../../ports/pull_request_issue_link_ports';
import { logError, logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import type { ParamUseCase } from '../../base/param_usecase';
import type { LinkPullRequestIssueContext } from '../../pull_request_workflow_context';
import {
    PullRequestIssueLinkOperationError,
    runLinkPullRequestIssue,
} from './link_pull_request_issue_workflow';
import {
    toApplicationError,
    type ApplicationErrorOptions,
} from '../../../errors/application_error';

export class LinkPullRequestIssueUseCase implements ParamUseCase<LinkPullRequestIssueContext, Result[]> {
    taskId = 'LinkPullRequestIssueUseCase';

    constructor(
        private readonly pullRequestIssueLinkPort: BoundPullRequestIssueLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: LinkPullRequestIssueContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        try {
            return await runLinkPullRequestIssue(
                param,
                this.taskId,
                this.pullRequestIssueLinkPort,
                this.eventualConsistencyDelayPort,
            );
        } catch (error) {
            const semanticError = toApplicationError(
                error,
                'provider.unavailable',
                'Unable to link the pull request to its issue.',
                error instanceof PullRequestIssueLinkOperationError
                    ? {
                        recovery: pullRequestLinkRecovery(error),
                    }
                    : {},
            );
            logError(semanticError);
            const recoveryStep = error instanceof PullRequestIssueLinkOperationError
                ? describeRecovery(error)
                : 'Unable to link the pull request to its issue. Inspect the PR base and description before rerunning the workflow.';
            return [new Result({
                id: this.taskId,
                success: false,
                executed: true,
                steps: [recoveryStep],
                errors: [semanticError],
            })];
        }
    }
}

function pullRequestLinkRecovery(
    error: PullRequestIssueLinkOperationError,
): NonNullable<ApplicationErrorOptions['recovery']> {
    const id = error.retainedBaseBranch
        ? error.retainedIssueReference
            ? 'pull-request-link-base-and-reference-retained'
            : 'pull-request-link-base-retained'
        : error.retainedIssueReference
            ? 'pull-request-link-reference-retained'
            : 'pull-request-link-restored';
    return { id, variables: {} };
}

function describeRecovery(error: PullRequestIssueLinkOperationError): string {
    const retainedState = [
        error.retainedBaseBranch ? 'the temporary default base branch' : undefined,
        error.retainedIssueReference ? 'the temporary issue reference in the description' : undefined,
    ].filter((state): state is string => state !== undefined);
    if (retainedState.length === 0) {
        return 'Pull-request issue linkage failed, but the original base and description were restored. Re-run the workflow.';
    }
    return `Pull-request issue linkage failed and retained ${retainedState.join(' and ')}. Restore that PR state, then re-run the workflow.`;
}
