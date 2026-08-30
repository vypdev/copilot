import type {
    PreviousWorkflowRunsQuery,
    PreviousWorkflowRunsQueryPort,
    WorkflowPollingDelayPort,
} from '../../../application/ports/workflow_run_ports';
import type {
    GithubWorkflowRunsClient,
    GithubWorkflowRun,
    GithubWorkflowRunsResponse,
    GithubWorkflowRunsMethod,
} from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { WORKFLOW_ACTIVE_STATUSES } from '../../../utils/constants';
import { withWorkflowRunsRetry, type WorkflowRunsRetryPolicy } from './workflow_runs_retry';

const DEFAULT_RETRY_POLICY: WorkflowRunsRetryPolicy = {
    maximumAttempts: 5,
    initialDelayMilliseconds: 1000,
    backoffMultiplier: 2,
    maximumDelayMilliseconds: 8000,
};

const NO_OP_DELAY_PORT: WorkflowPollingDelayPort = {
    async wait(): Promise<void> {
        return Promise.resolve();
    },
};

export class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    constructor(
        private readonly client: GithubWorkflowRunsClient,
        private readonly retryDelayPort: WorkflowPollingDelayPort = NO_OP_DELAY_PORT,
        private readonly retryPolicy: WorkflowRunsRetryPolicy = DEFAULT_RETRY_POLICY,
    ) {}

    async countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number> {
        const hasWorkflowScope = query.workflowNames?.some((name) => name.trim().length > 0) || query.workflowName.trim().length > 0;
        if (!Number.isFinite(query.currentRunId) || !hasWorkflowScope) {
            return 0;
        }

        let activeRunCount = 0;
        for (const status of WORKFLOW_ACTIVE_STATUSES) {
            activeRunCount += await this.countActiveRunsForStatus(query, status);
        }

        return activeRunCount;
    }

    private async countActiveRunsForStatus(
        query: PreviousWorkflowRunsQuery,
        status: string,
    ): Promise<number> {
        const useWorkflowEndpoint = Boolean(
            query.workflowIdentifier
            && (!query.workflowNames || query.workflowNames.length === 0)
            && this.client.rest.actions.listWorkflowRuns,
        );
        const method: GithubWorkflowRunsMethod = useWorkflowEndpoint
            ? this.client.rest.actions.listWorkflowRuns!
            : this.client.rest.actions.listWorkflowRunsForRepo;
        const parameters = {
            owner: query.owner,
            repo: query.repository,
            per_page: 100,
            status,
            ...(useWorkflowEndpoint ? { workflow_id: query.workflowIdentifier } : {}),
        };

        return withWorkflowRunsRetry(async () => {
            let activeRunCount = 0;
            for await (const response of this.client.paginate.iterator(method, parameters)) {
                activeRunCount += countMatchingRuns(this.extractWorkflowRuns(response), query);
            }
            return activeRunCount;
        }, this.retryDelayPort, this.retryPolicy);
    }

    private extractWorkflowRuns(response: GithubWorkflowRunsResponse): GithubWorkflowRun[] {
        if (Array.isArray(response.data)) {
            return response.data;
        }

        if (Array.isArray(response.data.workflow_runs)) {
            return response.data.workflow_runs;
        }

        throw new Error('GitHub workflow runs response did not contain a workflow_runs array.');
    }

}

function countMatchingRuns(runs: ReadonlyArray<GithubWorkflowRun>, query: PreviousWorkflowRunsQuery): number {
    return runs.filter((run) => isActivePreviousRun(run, query)).length;
}

function isActivePreviousRun(run: GithubWorkflowRun, query: PreviousWorkflowRunsQuery): boolean {
    const workflowMatches = query.workflowNames && query.workflowNames.length > 0
        ? query.workflowNames.includes(run.name ?? '')
        : run.name === query.workflowName;
    return workflowMatches
        && run.id < query.currentRunId
        && WORKFLOW_ACTIVE_STATUSES.includes(run.status ?? 'unknown');
}
