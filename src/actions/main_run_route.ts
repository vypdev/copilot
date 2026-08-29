import type {
    MainRunRoute as ApplicationMainRunRoute,
    MainRunRouteInput as ApplicationMainRunRouteInput,
} from '../application/ports/main_run_route_ports';

export type MainRunRoute = ApplicationMainRunRoute;
export type MainRunRouteInput = ApplicationMainRunRouteInput;

export function resolveMainRunRoute(input: MainRunRouteInput): MainRunRoute {
    if (input.isSingleAction) return 'single-action';
    if (input.isIssue) return input.isIssueComment ? 'issue-comment' : 'issue';
    if (input.isPullRequest) {
        return input.isPullRequestReviewComment ? 'pull-request-review-comment' : 'pull-request';
    }
    if (input.isPush) return 'push';
    return 'unhandled';
}
