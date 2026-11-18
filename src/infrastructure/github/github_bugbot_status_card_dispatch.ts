import { getOctokit } from '@actions/github';
import type { BugbotStatusCardTerminalPort } from '../../application/ports/bugbot_reconciliation_ports';
import type { BugbotReviewProgressObservation } from '../../application/ports/bugbot_review_progress_ports';
import { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';
import { createPullRequestLifecycleClient } from '../composition/github_pull_request_client_factory';
import { encodeGithubBugbotStatusCardHandoff } from './github_bugbot_status_card_handoff';
import {
    bugbotStatusCardPath, bugbotStatusCardWorkflow, readGithubBugbotStatusCardInstallation, statusCardGithubErrorStatus,
} from './github_bugbot_status_card_installation';

const unresolved = () => new Error('The shared Bugbot status card writer did not acknowledge publication.');

export async function createGithubBugbotStatusCardDispatcher(binding: {
    owner: string; repository: string; repositoryId: unknown; defaultBranch: unknown;
    token: string; evidenceToken: string; event: string; policy: string;
}, environment: NodeJS.ProcessEnv = process.env) {
    const runId = parsePositiveSafeInteger(environment.GITHUB_RUN_ID);
    const attempt = parsePositiveSafeInteger(environment.GITHUB_RUN_ATTEMPT);
    const repositoryId = parsePositiveSafeInteger(binding.repositoryId);
    const ref = binding.defaultBranch;
    if (!runId || !attempt || !repositoryId || typeof ref !== 'string' || !ref
        || environment.GITHUB_REPOSITORY !== binding.owner + '/' + binding.repository
        || !['pull_request', 'pull_request_review', 'pull_request_review_comment', 'issue_comment', 'push'].includes(binding.event)) return undefined;
    const read = getOctokit(binding.evidenceToken);
    const write = getOctokit(binding.token);
    const scope = { owner: binding.owner, repo: binding.repository };
    const workflow = { ...scope, workflow_id: bugbotStatusCardWorkflow };
    const installation = await readGithubBugbotStatusCardInstallation(read, scope, ref);
    if (installation === 'absent') return undefined;
    const pullRequests = new PullRequestLifecycleRepository(createPullRequestLifecycleClient());
    const dispatch = async (request: Parameters<typeof encodeGithubBugbotStatusCardHandoff>[0]): Promise<number> => {
        const inputs = encodeGithubBugbotStatusCardHandoff(request);
        if (installation !== 'installed' || !inputs) throw unresolved();
        const { data } = await write.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
            ...workflow, ref, inputs, return_run_details: true,
        });
        const published = data as { workflow_run_id?: number } | undefined;
        const operation = parsePositiveSafeInteger(published?.workflow_run_id);
        if (!operation) throw unresolved();
        return operation;
    };
    const terminal: BugbotStatusCardTerminalPort = {
        async publish(input) {
            const source = await pullRequests.getBugbotSourceBoundPullRequestIdentity(binding.owner, binding.repository,
                input.pullRequestNumber, binding.evidenceToken);
            const base = canonicalGitObjectId(source.baseSha);
            const baseRef = canonicalGitObjectId(source.baseRefSha);
            if (!base || !baseRef || base !== input.baseSha || baseRef !== (input.baseRefSha ?? input.baseSha)
                || source.state !== 'open' || source.baseRepository.id !== repositoryId
                || source.headRepositoryOwner !== binding.owner || source.headRepositoryName !== binding.repository
                || source.headSha !== input.headSha) throw unresolved();
            const effect = await dispatch({ kind: binding.event === 'pull_request' ? 'analysis-result' : 'state-refresh',
                runId, attempt, source: { repositoryId, pullNumber: source.number, base, baseRef, head: source.headSha, policy: binding.policy },
                verifiedBody: input.body });
            // This deadline is only for acknowledging the short comment job.
            const until = Date.now() + 7 * 60_000;
            while (Date.now() < until) {
                const observed = await read.rest.actions.getWorkflowRun({ ...scope, run_id: effect }).catch((error: unknown) => {
                    if (statusCardGithubErrorStatus(error) === 404) return undefined;
                    throw unresolved();
                });
                if (!observed) {
                    await new Promise(resolve => setTimeout(resolve, 4_000));
                    continue;
                }
                const { data } = observed;
                if (data.id !== effect || data.repository.id !== repositoryId || data.path !== bugbotStatusCardPath
                    || data.event !== 'workflow_dispatch' || data.head_branch !== ref) throw unresolved();
                if (data.status === 'completed') {
                    if (data.conclusion !== 'success') throw unresolved();
                    const { data: jobs } = await read.rest.actions.listJobsForWorkflowRun({ ...scope, run_id: effect, per_page: 20, filter: 'latest' });
                    if (jobs.total_count === 1 && jobs.jobs.length === 1
                        && jobs.jobs[0].name === 'Publish Bugbot status card' && jobs.jobs[0].head_sha === data.head_sha
                        && jobs.jobs[0].conclusion === 'success' && jobs.jobs[0].steps?.some((step: { name: string; conclusion?: string | null }) =>
                            step.name === 'Publish canonical comment' && step.conclusion === 'success')) return 'published';
                    throw unresolved();
                }
                await new Promise(resolve => setTimeout(resolve, 4_000));
            }
            throw unresolved();
        },
    };
    return {
        terminal,
        async wake(observation: BugbotReviewProgressObservation) {
            if (installation !== 'installed' || !observation.baseSha) return;
            await dispatch({ kind: 'progress', runId, attempt, source: { repositoryId, pullNumber: observation.pullNumber,
                base: observation.baseSha, baseRef: observation.baseRefSha ?? observation.baseSha, head: observation.headSha, policy: binding.policy } });
        },
    };
}
