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

export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
}

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

        return this.withTransientErrorRetry(async () => {
            let activeRunCount = 0;
            for await (const response of this.client.paginate.iterator(method, parameters)) {
                activeRunCount += this.extractWorkflowRuns(response).filter(
                    (run) => this.isActivePreviousRun(run, query),
                ).length;
            }
            return activeRunCount;
        });
    }

    private async withTransientErrorRetry<T>(operation: () => Promise<T>): Promise<T> {
        let delayMilliseconds = this.retryPolicy.initialDelayMilliseconds;

        for (let attempt = 1; attempt <= this.retryPolicy.maximumAttempts; attempt++) {
            try {
                return await operation();
            } catch (error: unknown) {
                if (attempt === this.retryPolicy.maximumAttempts || !this.isTransientError(error)) {
                    throw error;
                }

                await this.retryDelayPort.wait(delayMilliseconds);
                delayMilliseconds = Math.min(
                    delayMilliseconds * this.retryPolicy.backoffMultiplier,
                    this.retryPolicy.maximumDelayMilliseconds,
                );
            }
        }

        throw new Error('Workflow runs request retry policy was exhausted.');
    }

    private isTransientError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }

        const candidate = error as { status?: unknown; code?: unknown };
        if (typeof candidate.status === 'number') {
            return candidate.status === 408 || candidate.status === 429 || candidate.status >= 500;
        }

        return typeof candidate.code === 'string'
            && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(candidate.code);
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

    private isActivePreviousRun(run: GithubWorkflowRun, query: PreviousWorkflowRunsQuery): boolean {
        const workflowMatches = query.workflowNames && query.workflowNames.length > 0
            ? query.workflowNames.includes(run.name ?? '')
            : run.name === query.workflowName;
        return workflowMatches
            && run.id < query.currentRunId
            && WORKFLOW_ACTIVE_STATUSES.includes(run.status ?? 'unknown');
    }
}
