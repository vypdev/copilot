import type {
    PreviousWorkflowRunsQuery,
    PreviousWorkflowRunsQueryPort,
    WorkflowPollingDelayPort,
    WorkflowPollingObserverPort,
    WorkflowPollingRandomPort,
    WorkflowQueueClockPort,
    WorkflowQueueRequestContext,
} from '../../../application/ports/workflow_run_ports';
import type {
    GithubWorkflowRunsClient,
    GithubWorkflowRun,
    GithubWorkflowRunsResponse,
} from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { WORKFLOW_ACTIVE_STATUSES } from '../../../utils/constants';
import { withWorkflowRunsRetry, WORKFLOW_RUNS_RETRY_POLICY, type WorkflowRunsRetryPolicy } from './workflow_runs_retry';

const NO_OP_DELAY_PORT: WorkflowPollingDelayPort = { wait: async () => undefined };
const SYSTEM_CLOCK: WorkflowQueueClockPort = { nowMilliseconds: () => Date.now() };
const SYSTEM_RANDOM: WorkflowPollingRandomPort = { next: () => Math.random() };

export class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    constructor(
        private readonly client: GithubWorkflowRunsClient,
        private readonly retryDelayPort: WorkflowPollingDelayPort = NO_OP_DELAY_PORT,
        private readonly retryPolicy: WorkflowRunsRetryPolicy = WORKFLOW_RUNS_RETRY_POLICY,
        private readonly clock: WorkflowQueueClockPort = SYSTEM_CLOCK,
        private readonly random: WorkflowPollingRandomPort = SYSTEM_RANDOM,
        private readonly observer?: WorkflowPollingObserverPort,
    ) {}

    async countActivePreviousRuns(
        query: PreviousWorkflowRunsQuery,
        context: WorkflowQueueRequestContext = { deadlineAtMilliseconds: Number.POSITIVE_INFINITY },
    ): Promise<number> {
        if (!Number.isSafeInteger(query.currentRunId)) {
            throw new Error('GitHub workflow identity is unavailable; refusing to bypass sequential execution.');
        }
        const workflowNames = query.workflowNames?.filter(name => name.trim().length > 0) ?? [];
        if (workflowNames.length === 0 && query.workflowName.trim().length === 0) {
            throw new Error('GitHub workflow name is unavailable; refusing to bypass sequential execution.');
        }
        const actions = this.client.rest.actions;
        const workflowIdentifier = workflowNames.length === 0 ? query.workflowIdentifier : undefined;
        const workflowMethod = workflowIdentifier ? actions.listWorkflowRuns : undefined;
        const method = workflowMethod ?? actions.listWorkflowRunsForRepo;
        if (!method) throw new Error('GitHub workflow-scoped runs endpoint is unavailable.');
        const parameters = {
            owner: query.owner,
            repo: query.repository,
            per_page: 100,
            ...(workflowMethod && workflowIdentifier
                ? { workflow_id: workflowIdentifier }
                : {}),
        };
        const names = workflowNames.length > 0 ? workflowNames : [query.workflowName];

        return withWorkflowRunsRetry(async () => {
            let activeRunCount = 0;
            // Keep one complete sequential traversal: GitHub cannot safely express
            // the seven shared workflow names, five active statuses, or the strict
            // lower-ID predicate in this endpoint. Do not add provider filters or
            // early-stop on page order; a matching run may occur on a later page.
            // The residual cost is deep-history pagination, with retries restarting
            // from page one, in exchange for an exact fail-closed count.
            for await (const response of this.client.paginate.iterator(method, parameters)) {
                activeRunCount += extractWorkflowRuns(response)
                    .filter(run => isActivePreviousRun(run, query, names)).length;
            }
            return activeRunCount;
        }, {
            delayPort: this.retryDelayPort,
            clock: this.clock,
            random: this.random,
            observer: this.observer,
            policy: this.retryPolicy,
            deadlineAtMilliseconds: context.deadlineAtMilliseconds,
        });
    }
}

function extractWorkflowRuns(response: GithubWorkflowRunsResponse): GithubWorkflowRun[] {
    const data = response?.data;
    if (Array.isArray(data)) return data;
    if (data !== null && typeof data === 'object' && Array.isArray(data.workflow_runs)) {
        return data.workflow_runs;
    }
    throw new Error('GitHub workflow runs response did not contain a workflow_runs array.');
}

function isActivePreviousRun(
    run: GithubWorkflowRun,
    query: PreviousWorkflowRunsQuery,
    workflowNames: readonly string[],
): boolean {
    return typeof run.name === 'string'
        && workflowNames.includes(run.name)
        && run.id < query.currentRunId
        && WORKFLOW_ACTIVE_STATUSES.includes(run.status ?? 'unknown');
}