import { WORKFLOW_STATUS } from '../../../../utils/constants';
import type {
  GithubWorkflowRunsClient,
  GithubWorkflowRun,
  GithubWorkflowRunsResponse,
} from '../../../../infrastructure/github/ports/github_workflow_provider_ports';
import { ActivePreviousWorkflowRunsRepository } from '../active_previous_workflow_runs_repository';

const listWorkflowRunsForRepo = jest.fn();
const iterator = jest.fn();
const client = {
  rest: { actions: { listWorkflowRunsForRepo } },
  paginate: { iterator },
} as unknown as GithubWorkflowRunsClient;

function workflowRun(run: Pick<GithubWorkflowRun, 'id' | 'name' | 'status'>): GithubWorkflowRun {
  return run as GithubWorkflowRun;
}

describe('ActivePreviousWorkflowRunsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    { currentRunId: Number.NaN, workflowName: 'CI' },
    { currentRunId: 200, workflowName: '' },
  ])('skips provider pagination for an invalid query identity', async ({ currentRunId, workflowName }) => {
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId,
      workflowName,
    })).resolves.toBe(0);
    expect(iterator).not.toHaveBeenCalled();
  });

  it('counts matching active previous runs across every provider page', async () => {
    const pages: GithubWorkflowRunsResponse[] = [
      {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'CI', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 200, name: 'CI', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 197, name: 'Other', status: WORKFLOW_STATUS.IN_PROGRESS }),
          ],
        },
      },
      {
        data: {
          workflow_runs: [
            workflowRun({ id: 198, name: 'CI', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 196, name: 'CI', status: 'completed' }),
            workflowRun({ id: 195, name: null, status: null }),
          ],
        },
      },
    ];
    iterator.mockImplementation(async function* () {
      yield* pages;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    const count = await repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    });

    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
    });
    expect(count).toBe(2);
  });
});
