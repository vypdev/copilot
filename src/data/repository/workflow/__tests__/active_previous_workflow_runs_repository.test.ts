import { WORKFLOW_ACTIVE_STATUSES, WORKFLOW_STATUS } from '../../../../utils/constants';
import type {
  GithubWorkflowRunsClient,
  GithubWorkflowRun,
  GithubWorkflowRunsResponse,
} from '../../../../infrastructure/github/ports/github_workflow_provider_ports';
import { ActivePreviousWorkflowRunsRepository } from '../active_previous_workflow_runs_repository';

const listWorkflowRunsForRepo = jest.fn();
const listWorkflowRuns = jest.fn();
const iterator = jest.fn();
const client = {
  rest: { actions: { listWorkflowRunsForRepo, listWorkflowRuns } },
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
    iterator.mockImplementation(async function* (_method: unknown, parameters: { status?: string }) {
      if (parameters.status === WORKFLOW_STATUS.IN_PROGRESS) {
        yield pages[0];
      }
      if (parameters.status === WORKFLOW_STATUS.QUEUED) {
        yield pages[1];
      }
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
      status: WORKFLOW_STATUS.IN_PROGRESS,
    });
    expect(iterator).toHaveBeenCalledTimes(WORKFLOW_ACTIVE_STATUSES.length);
    expect(count).toBe(2);
  });

  it('counts runs when Octokit pagination yields array pages', async () => {
    const pages: GithubWorkflowRunsResponse[] = [
      {
        data: [
          workflowRun({ id: 199, name: 'CI', status: WORKFLOW_STATUS.IN_PROGRESS }),
          workflowRun({ id: 198, name: 'CI', status: WORKFLOW_STATUS.QUEUED }),
        ],
      },
    ];
    iterator.mockImplementation(async function* (_method: unknown, parameters: { status?: string }) {
      if (parameters.status === WORKFLOW_STATUS.IN_PROGRESS) {
        yield* pages;
      }
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    const count = await repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
      workflowIdentifier: 'copilot_issue.yml',
    });

    expect(count).toBe(2);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      status: WORKFLOW_STATUS.IN_PROGRESS,
      workflow_id: 'copilot_issue.yml',
    });
  });

  it('queries the repository endpoint and counts every Copilot workflow in the shared queue', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'Copilot - Issue Comment', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 198, name: 'Task - Release', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 197, name: 'Unrelated workflow', status: WORKFLOW_STATUS.IN_PROGRESS }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);
    const workflowNames = ['Copilot - Issue', 'Copilot - Issue Comment', 'Task - Release'];

    const count = await repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'Copilot - Issue',
      workflowIdentifier: 'copilot_issue.yml',
      workflowNames,
    });

    expect(count).toBe(WORKFLOW_ACTIVE_STATUSES.length * 2);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, expect.objectContaining({
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      status: WORKFLOW_STATUS.IN_PROGRESS,
    }));
    expect(iterator).not.toHaveBeenCalledWith(listWorkflowRuns, expect.anything());
  });

  it('uses the shared workflow scope even when the current workflow name is unavailable', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: [] } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: '',
      workflowNames: ['Copilot - Issue'],
    })).resolves.toBe(0);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, expect.anything());
  });

  it('reports malformed workflow run pages clearly', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: {} } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    })).rejects.toThrow('GitHub workflow runs response did not contain a workflow_runs array.');
  });

  it('reports an absent workflow response clearly', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: undefined } as unknown as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    })).rejects.toThrow('GitHub workflow runs response did not contain a workflow_runs array.');
  });

  it('retries transient provider failures before returning active runs', async () => {
    const retryDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    let attempts = 0;
    iterator.mockImplementation(async function* (_method: unknown, parameters: { status?: string }) {
      if (parameters.status !== WORKFLOW_STATUS.IN_PROGRESS) {
        return;
      }

      attempts += 1;
      if (attempts === 1) {
        throw { status: 500 };
      }

      yield { data: [] } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client, retryDelayPort, {
      maximumAttempts: 3,
      initialDelayMilliseconds: 10,
      backoffMultiplier: 2,
      maximumDelayMilliseconds: 100,
    });

    await expect(repository.countActivePreviousRuns({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    })).resolves.toBe(0);

    expect(attempts).toBe(2);
    expect(retryDelayPort.wait).toHaveBeenCalledWith(10);
  });
});
