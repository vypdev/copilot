import { GithubActionSummaryAdapter } from '../github/github_action_summary_adapter';

export function createGithubActionSummaryCompositionRoot(): GithubActionSummaryAdapter {
    return new GithubActionSummaryAdapter();
}
