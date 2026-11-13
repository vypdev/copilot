import type { ActionSummaryPort } from '../../application/ports/action_summary_ports';
import type { CopilotEvidenceRepository } from '../../data/repository/copilot_evidence_repository';
import { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import { githubBugbotReviewProgress } from '../github/github_bugbot_review_progress_adapter';
import { createPullRequestLifecycleClient } from './github_pull_request_client_factory';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';

export function createGithubBugbotReviewProgress(
    binding: RepositoryCredentialBinding & { readonly pullNumber: number; readonly expectedHead?: string; readonly expectedBase?: string; readonly policy?: string },
    evidence: Pick<CopilotEvidenceRepository, 'observeReview'>,
    summary: ActionSummaryPort,
    environment: NodeJS.ProcessEnv = process.env,
) {
    const { owner, repository, token } = binding;
    const runId = Number(environment.GITHUB_RUN_ID);
    const attempt = Number(environment.GITHUB_RUN_ATTEMPT);
    const server = environment.GITHUB_SERVER_URL ?? '';
    if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(attempt) || attempt < 1
        || environment.GITHUB_REPOSITORY !== `${owner}/${repository}`
        || !/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/u.test(server)) return undefined;
    const runUrl = `${server}/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${runId}/attempts/${attempt}`;
    const pullRequests = new PullRequestLifecycleRepository(createPullRequestLifecycleClient());
    return githubBugbotReviewProgress({ ...binding, runId, attempt, runUrl }, summary,
        number => pullRequests.getBugbotSourceBoundPullRequestIdentity(owner, repository, number, token),
        check => evidence.observeReview(check, owner, repository, environment.COPILOT_EVIDENCE_TOKEN?.trim() || token));
}
