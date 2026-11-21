import { nativePageSize, readCompleteNativeList } from './native_list_pagination';
import { getOctokit } from '@actions/github';
import type { BugbotStatusCardSnapshot, BugbotStatusCardSource } from '../../application/policies/bugbot_status_card_publication_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import { createPullRequestLifecycleClient } from '../composition/github_pull_request_client_factory';
import { createBugbotCompositionRoot } from '../composition/bugbot_composition_root';
import { decodeGithubBugbotStatusCardHandoff, githubBugbotStatusCardOperation } from './github_bugbot_status_card_handoff';
import { runAdmittedGithubBugbotStatusCardJob } from './github_bugbot_status_card_lane';
import { nativeBugbotAnalysisPath, readNativeBugbotStatusCardReview, type NativeGithubRun, type NativeGithubCheck } from './github_bugbot_status_card_observation';
import { bugbotStatusCardPath } from './github_bugbot_status_card_installation';

const sourceEvents = new Map([
    [nativeBugbotAnalysisPath, 'pull_request'],
    ['.github/workflows/copilot_pull_request_review_state.yml', 'pull_request_review'],
    ['.github/workflows/copilot_pull_request_comment.yml', 'pull_request_review_comment'],
    ['.github/workflows/copilot_issue_comment.yml', 'issue_comment'],
    ['.github/workflows/copilot_commit.yml', 'push'],
]);

export async function runGithubBugbotStatusCardWorkflow(binding: {
    owner: string; repository: string; event: string; ref: string; workflowRef: string;
    actor: string; token: string; evidenceToken: string; server: string;
    locale: string; policy: string; inputs: { pullNumber: unknown; work: unknown; operation: unknown };
}) {
    const request = decodeGithubBugbotStatusCardHandoff(binding.inputs);
    const correlation = typeof binding.inputs.operation === 'string'
        ? binding.inputs.operation.match(/^(0|[1-9]\d*):[a-f0-9]{64}$/u)?.[1] : undefined;
    const sequence = correlation === undefined ? undefined : Number(correlation);
    const repository = binding.owner + '/' + binding.repository;
    if (binding.event !== 'workflow_dispatch' || binding.workflowRef !== repository + '/' + bugbotStatusCardPath + '@' + binding.ref
        || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/iu.test(binding.server) || !request
        || request.kind === 'progress' && (sequence === undefined || !Number.isSafeInteger(sequence))
        || typeof binding.inputs.work !== 'string'
        || binding.inputs.operation !== githubBugbotStatusCardOperation(binding.inputs.work, request.kind === 'progress' ? sequence : undefined)) return 'skipped';
    const api = getOctokit(binding.evidenceToken);
    const scope = { owner: binding.owner, repo: binding.repository };
    const [authenticated, repo] = await Promise.all([
        getOctokit(binding.token).rest.users.getAuthenticated(),
        api.rest.repos.get(scope),
    ]);
    if (authenticated.data.login !== binding.actor || repo.data.id !== request.source.repositoryId
        || binding.ref !== 'refs/heads/' + repo.data.default_branch || binding.policy !== request.source.policy) return 'skipped';

    const { scm } = createBugbotCompositionRoot(binding);
    const pullRequests = new PullRequestLifecycleRepository(createPullRequestLifecycleClient());
    const { source, runId, attempt, kind } = request;
    const repositoryUrl = binding.server + '/' + repository;
    const readRun = async () => (await api.rest.actions.getWorkflowRun({ ...scope, run_id: runId })).data;
    const readSource = async (): Promise<BugbotStatusCardSource | undefined> => {
        const identity = await pullRequests.getBugbotSourceBoundPullRequestIdentity(binding.owner, binding.repository,
            source.pullNumber, binding.evidenceToken);
        const { number: pullNumber, baseRepository, headRepositoryOwner, headRepositoryName, state } = identity;
        const base = canonicalGitObjectId(identity.baseSha);
        const baseRef = canonicalGitObjectId(identity.baseRefSha);
        const head = canonicalGitObjectId(identity.headSha);
        return state === 'open' && baseRepository.id === source.repositoryId
            && headRepositoryOwner === binding.owner && headRepositoryName === binding.repository
            && base && baseRef && head ? { repositoryId: baseRepository.id, pullNumber, base, baseRef, head, policy: binding.policy } : undefined;
    };
    const initial = await readSource();
    if (!initial || initial.base !== source.base || initial.baseRef !== source.baseRef || initial.head !== source.head) return 'skipped';

    const readReview = async (): Promise<BugbotStatusCardSnapshot['review'] | undefined> => {
        const [origin, runs]: [NativeGithubRun, readonly NativeGithubRun[] | undefined] = await Promise.all([readRun(), readCompleteNativeList<NativeGithubRun>(async page => {
            const { data } = await api.rest.actions.listWorkflowRuns({
                ...scope, workflow_id: 'copilot_pull_request.yml', event: 'pull_request', head_sha: source.head,
                per_page: nativePageSize, page,
            });
            return { total: data.total_count, items: data.workflow_runs };
        })]);
        const originEvent = sourceEvents.get(origin.path ?? '');
        if (origin.id !== runId || origin.run_attempt !== attempt || origin.repository?.id !== source.repositoryId
            || origin.head_repository?.id !== source.repositoryId || !originEvent || originEvent !== origin.event
            || (kind !== 'progress' && origin.status !== 'in_progress')
            || !runs) return undefined;
        const [active] = runs.filter(record => record.pull_requests?.some(pull => pull.number === source.pullNumber
            && pull.head.sha === source.head && pull.base.sha === source.base))
            .sort((left, right) => (Date.parse(right.created_at ?? '') || 0) - (Date.parse(left.created_at ?? '') || 0) || right.id - left.id);
        if (origin.path === nativeBugbotAnalysisPath && active?.id !== runId) return undefined;
        if (kind === 'analysis-result') {
            return origin.path === nativeBugbotAnalysisPath
                ? { runId, attempt, state: 'complete', closeAttempt: true } : undefined;
        }
        if (!active) return kind === 'state-refresh' ? { runId, attempt, state: 'complete' } : undefined;
        const checks = await readCompleteNativeList<NativeGithubCheck>(async page => {
            const { data } = await api.rest.checks.listForRef({
                ...scope, ref: source.head, check_name: 'Copilot / Review', filter: 'all', per_page: nativePageSize, page,
            });
            return { total: data.total_count, items: data.check_runs };
        });
        if (!checks) return undefined;
        const currentWork = { source, runId: active.id, attempt: active.run_attempt ?? 0, dryRun: false };
        const current = readNativeBugbotStatusCardReview(currentWork, repositoryUrl, active, { total_count: checks.length, check_runs: checks });
        if (current) return current;
        return kind === 'state-refresh' && active.status === 'completed' && active.conclusion === 'success'
            ? { runId, attempt, state: 'complete' } : undefined;
    };

    const observed = await readReview();
    if (!observed) return 'skipped';
    return runAdmittedGithubBugbotStatusCardJob({ source, runId: observed.runId, attempt: observed.attempt, dryRun: false }, {
        repositoryId: repo.data.id, pullNumber: source.pullNumber, trustedAuthorLogin: authenticated.data.login, repositoryUrl,
        locale: binding.locale, ...(request.kind !== 'progress' ? { verifiedBody: request.verifiedBody } : {}),
        readSource, readReview,
        async readComments() {
            const observation = await scm.context.listIssueComments(source.pullNumber);
            return observation.coverage.status === 'complete' ? observation.value : undefined;
        },
        createComment: body => scm.reconciliation.presentation.comments.addComment(source.pullNumber, body, { commitSha: source.head }),
        updateComment: (id, body) => scm.reconciliation.presentation.comments.updateComment(source.pullNumber, id, body, { commitSha: source.head }),
    });
}
