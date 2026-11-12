interface CiScope { readonly owner: string; readonly repo: string }
type CiQueryOptions = CiScope & {
    readonly [parameter: string]: unknown;
    readonly request: { readonly signal: AbortSignal };
    readonly per_page: number;
};
interface ActionsRun {
    readonly id: number;
    readonly name?: string | null;
    readonly repository?: { readonly full_name: string } | null;
    readonly head_repository?: { readonly full_name: string } | null;
    readonly head_sha: string;
    readonly event: string;
    readonly pull_requests?: readonly { readonly number: number }[] | null;
    readonly workflow_id: number;
    readonly run_attempt?: number;
    readonly status: string | null;
    readonly conclusion: string | null;
}
interface ActionsStep {
    readonly name: string;
    readonly number: number;
    readonly status: string;
    readonly conclusion: string | null;
}
interface ActionsJob {
    readonly id: number;
    readonly run_id: number;
    readonly run_attempt?: number | null;
    readonly head_sha: string;
    readonly name: string;
    readonly status: string;
    readonly conclusion: string | null;
    readonly steps?: readonly ActionsStep[] | null;
}
interface Actions {
    listWorkflowRunsForRepo(options: CiQueryOptions & { readonly head_sha: string }): Promise<{
        readonly data: { readonly total_count: number; readonly workflow_runs: readonly ActionsRun[] };
    }>;
    listJobsForWorkflowRunAttempt(options: CiQueryOptions & { readonly run_id: number; readonly attempt_number: number }): Promise<{
        readonly data: { readonly total_count: number; readonly jobs: readonly ActionsJob[] };
    }>;
}

export interface BugbotCiRequest {
    readonly sha: string;
    readonly workflow: string;
    readonly job: string;
    readonly step: string;
    readonly pullRequest?: number;
    readonly revision: 'head' | 'base';
}

export type BugbotCiReader = (request: BugbotCiRequest, signal?: AbortSignal) => Promise<
    | { readonly status: 'ci-unavailable' | 'ci-no-match' | 'ci-search-limit' | 'ci-ambiguous' }
    | {
        readonly status: 'ci-observed';
        readonly runId: number;
        readonly attempt: number;
        readonly jobId: number;
        readonly stepNumber: number;
        readonly url: string;
        readonly lines: readonly string[];
    }
>;

/** Authenticated read-only view of a named Actions step associated with the exact revision. */
export function createGitHubBugbotCiReader(
    repository: CiScope,
    actions: Actions,
): BugbotCiReader {
    return async (query, signal) => {
        const request = { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) };
        try {
            const runs = (await actions.listWorkflowRunsForRepo({
                ...repository, request, head_sha: query.sha, per_page: 100,
            })).data;
            if (runs.total_count > runs.workflow_runs.length) return { status: 'ci-search-limit' };
            const fullName = repository.owner + '/' + repository.repo;
            const matching = runs.workflow_runs.filter(run => run.name === query.workflow
                && run.head_sha === query.sha && run.repository?.full_name === fullName
                && (!run.head_repository || run.head_repository.full_name === fullName)
                && (run.event === 'push' || (query.revision === 'head' && run.event === 'pull_request'
                    && (!run.pull_requests?.length || run.pull_requests.some(pr => pr.number === query.pullRequest)))))
                .sort((left, right) => right.id - left.id);
            const run = matching[0];
            if (!run || !run.run_attempt) return { status: 'ci-no-match' };
            if (matching.some(item => item.workflow_id !== run.workflow_id)) return { status: 'ci-ambiguous' };
            const jobs = (await actions.listJobsForWorkflowRunAttempt({
                ...repository, request, run_id: run.id, attempt_number: run.run_attempt, per_page: 100,
            })).data;
            if (jobs.total_count > jobs.jobs.length) return { status: 'ci-search-limit' };
            const candidates = jobs.jobs.filter(job => job.name === query.job && job.run_id === run.id
                && job.run_attempt === run.run_attempt && job.head_sha === query.sha);
            const steps = candidates.flatMap(job => job.steps?.filter(step => step.name === query.step)
                .map(step => ({ job, step })) ?? []);
            if (candidates.length > 1 || steps.length > 1) return { status: 'ci-ambiguous' };
            if (!steps.length) return { status: 'ci-no-match' };
            const [{ job, step }] = steps;
            const { owner, repo } = repository;
            return { status: 'ci-observed', runId: run.id, attempt: run.run_attempt, jobId: job.id, stepNumber: step.number,
                url: `https://github.com/${owner}/${repo}/actions/runs/${run.id}/job/${job.id}#step:${step.number}:1`,
                lines: [
                    `Actions run ${run.id}, attempt ${run.run_attempt}, associated head ${query.sha}.`,
                    `Workflow ${query.workflow}: ${run.status}, conclusion ${run.conclusion ?? 'pending'}.`,
                    `Job ${query.job}: ${job.status}, conclusion ${job.conclusion ?? 'pending'}.`,
                    `Step ${step.number} ${query.step}: ${step.status}, conclusion ${step.conclusion ?? 'pending'}.`,
                    run.event === 'pull_request' && !run.pull_requests?.length
                        ? 'GitHub did not expose an associated PR. This observation is scoped to the reported head SHA.'
                        : `GitHub Actions event: ${run.event}.`,
                    'GitHub Actions step metadata. The checkout and individual test results are unverified by this receipt.',
                ],
            };
        } catch {
            return { status: 'ci-unavailable' };
        }
    };
}
