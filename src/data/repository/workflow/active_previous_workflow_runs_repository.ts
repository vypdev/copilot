import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort } from '../../../application/ports/workflow_run_ports';
import type { GithubWorkflowRunsClient, GithubWorkflowRun } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { WORKFLOW_ACTIVE_STATUSES } from '../../../utils/constants';

export class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    constructor(private readonly client: GithubWorkflowRunsClient) {}

    async countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number> {
        if (!Number.isFinite(query.currentRunId) || query.workflowName.length === 0) {
            return 0;
        }

        let activeRunCount = 0;

        for await (const response of this.client.paginate.iterator(
            this.client.rest.actions.listWorkflowRunsForRepo,
            {
                owner: query.owner,
                repo: query.repository,
                per_page: 100,
            },
        )) {
            activeRunCount += response.data.workflow_runs.filter(
                (run) => this.isActivePreviousRun(run, query),
            ).length;
        }

        return activeRunCount;
    }

    private isActivePreviousRun(run: GithubWorkflowRun, query: PreviousWorkflowRunsQuery): boolean {
        return run.name === query.workflowName
            && run.id < query.currentRunId
            && WORKFLOW_ACTIVE_STATUSES.includes(run.status ?? 'unknown');
    }
}
