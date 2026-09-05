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
import { WORKFLOW_ACTIVE_STATUSES } from './workflow_status';
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
        const workflowIdentifier = query.workflowIdentifier?.trim() ?? '';
        if (workflowIdentifier.length === 0) {
            throw new Error('GitHub workflow identifier is unavailable; refusing to bypass sequential execution.');
        }
        const actions = this.client.rest.actions;
        const method = actions.listWorkflowRuns;
        if (!method) throw new Error('GitHub workflow-scoped runs endpoint is unavailable.');
        const parameters = {
            owner: query.owner,
            repo: query.repository,
            per_page: 100,
            workflow_id: workflowIdentifier,
        };

        return withWorkflowRunsRetry(async () => {
            let activeRunCount = 0;
            // The workflow-scoped endpoint limits the traversal to this workflow.
            // Keep pagination exhaustive because an active older run may occur on
            // a later page, while filtering status and run identity locally.
            for await (const response of this.client.paginate.iterator(method, parameters)) {
                activeRunCount += extractWorkflowRuns(response)
                    .filter(run => isActivePreviousRun(run, query)).length;
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
): boolean {
    return run.id < query.currentRunId
        && WORKFLOW_ACTIVE_STATUSES.includes(run.status ?? 'unknown');
}
