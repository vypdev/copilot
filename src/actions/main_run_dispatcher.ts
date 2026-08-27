import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import { logDebugInfo, logInfo } from '../utils/logger';
import type { ExecutableMainRunRoute, MainRunRouteHandlers } from './main_run_route_handlers';

export async function dispatchMainRunRoute(
    route: ExecutableMainRunRoute,
    execution: Execution,
    handlers: MainRunRouteHandlers,
): Promise<Result[]> {
    switch (route) {
        case 'single-action':
            logInfo(`Running SingleActionUseCase (action: ${execution.singleAction.currentSingleAction}).`);
            break;
        case 'issue-comment':
            logInfo(`Running IssueCommentUseCase for issue #${execution.issue.number}.`);
            break;
        case 'issue':
            logInfo(`Running IssueUseCase for issue #${execution.issueNumber}.`);
            break;
        case 'pull-request-review-comment':
            logInfo(`Running PullRequestReviewCommentUseCase for PR #${execution.pullRequest.number}.`);
            break;
        case 'pull-request':
            logInfo(`Running PullRequestUseCase for PR #${execution.pullRequest.number}.`);
            break;
        case 'push':
            logDebugInfo(`Push event. Branch: ${execution.commit?.branch ?? 'unknown'}, commits: ${execution.commit?.commits?.length ?? 0}, issue number: ${execution.issueNumber}.`);
            logInfo('Running CommitUseCase.');
            break;
    }

    return handlers[route](execution);
}
