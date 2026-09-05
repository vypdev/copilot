import { WORKFLOW_STATUS } from '../workflow_status';
import type {
  GithubWorkflowRun,
  GithubWorkflowRunsClient,
  GithubWorkflowRunsResponse,
} from '../../../../infrastructure/github/ports/github_workflow_provider_ports';
import { ActivePreviousWorkflowRunsRepository } from '../active_previous_workflow_runs_repository';
import { WORKFLOW_ACTIVE_STATUSES } from '../workflow_status';

const listWorkflowRuns = jest.fn();
const iterator = jest.fn();
const client = {
  rest: { actions: { listWorkflowRuns } },
  paginate: { iterator },
} as unknown as GithubWorkflowRunsClient;

function workflowRun(run: Pick<GithubWorkflowRun, 'id' | 'name' | 'status'>): GithubWorkflowRun {
  return run as GithubWorkflowRun;
}

const query = {
  owner: 'org',
  repository: 'repo',
  currentRunId: 200,
  workflowIdentifier: 'copilot_issue.yml',
};

describe('ActivePreviousWorkflowRunsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed for an invalid query identity', async () => {
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({ ...query, currentRunId: Number.NaN })).rejects.toThrow(
      'refusing to bypass sequential execution',
    );
    expect(iterator).not.toHaveBeenCalled();
  });

  it('fails closed without a workflow identifier', async () => {
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({ ...query, workflowIdentifier: undefined })).rejects.toThrow(
      'GitHub workflow identifier is unavailable; refusing to bypass sequential execution.',
    );
    expect(iterator).not.toHaveBeenCalled();
  });

  it('uses the workflow-scoped endpoint and locally filters active previous runs', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 198, name: 'Copilot - Issue', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 200, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 201, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 197, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 196, name: 'Copilot - Issue', status: WORKFLOW_STATUS.COMPLETED }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(3);
    expect(iterator).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
    });
  });

  it('detects an older active run on a later page', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: { workflow_runs: [] } } as GithubWorkflowRunsResponse;
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 150, name: 'Copilot - Issue', status: WORKFLOW_STATUS.WAITING }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(1);
    expect(iterator).toHaveBeenCalledTimes(1);
  });

  it('counts all active statuses across every page of the current workflow', async () => {
    const runs = WORKFLOW_ACTIVE_STATUSES.map((status, index) => workflowRun({
      id: 1 + index,
      name: 'Copilot - Issue',
      status,
    }));
    iterator.mockImplementation(async function* () {
      yield { data: { workflow_runs: runs.slice(0, 2) } } as GithubWorkflowRunsResponse;
      yield { data: { workflow_runs: runs.slice(2) } } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(WORKFLOW_ACTIVE_STATUSES.length);
    expect(iterator).toHaveBeenCalledTimes(1);
  });

  it('excludes cancelled and skipped terminal runs', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 198, name: 'Copilot - Issue', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 197, name: 'Copilot - Issue', status: WORKFLOW_STATUS.CANCELLED }),
            workflowRun({ id: 196, name: 'Copilot - Issue', status: WORKFLOW_STATUS.SKIPPED }),
            workflowRun({ id: 200, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(2);
  });

  it('supports both Octokit page shapes from the workflow endpoint', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: [workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.PENDING })],
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
    });
  });

  it('fails closed when the workflow-scoped endpoint is unavailable', async () => {
    const unsupportedClient = {
      rest: { actions: {} },
      paginate: { iterator },
    } as unknown as GithubWorkflowRunsClient;
    const repository = new ActivePreviousWorkflowRunsRepository(unsupportedClient);

    await expect(repository.countActivePreviousRuns(query)).rejects.toThrow(
      'GitHub workflow-scoped runs endpoint is unavailable',
    );
    expect(iterator).not.toHaveBeenCalled();
  });

  it('does not switch endpoints after a scoped provider failure', async () => {
    iterator.mockImplementation(async function* () {
      yield* [];
      throw { status: 404 };
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).rejects.toMatchObject({ status: 404 });
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
    });
  });

  it('rejects malformed provider pages instead of treating them as empty', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: { workflow_runs: [] } } as GithubWorkflowRunsResponse;
      yield { data: {} } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).rejects.toThrow(
      'did not contain a workflow_runs array',
    );
  });

  it('retries the complete paginated traversal after a transient later-page failure', async () => {
    const retryDelayPort = { wait: jest.fn().mockResolvedValue(undefined) };
    let traversals = 0;
    iterator.mockImplementation(async function* () {
      traversals += 1;
      yield { data: { workflow_runs: [] } } as GithubWorkflowRunsResponse;
      if (traversals === 1) throw { status: 500 };
      yield {
        data: { workflow_runs: [workflowRun({ id: 150, name: 'Copilot - Issue', status: WORKFLOW_STATUS.QUEUED })] },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client, retryDelayPort, {
      maximumAttempts: 3,
      rateLimitMaximumAttempts: 5,
      initialDelayMilliseconds: 10,
      backoffMultiplier: 2,
      maximumDelayMilliseconds: 100,
      jitterRatio: 0,
    });

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(1);
    expect(traversals).toBe(2);
    expect(retryDelayPort.wait).toHaveBeenCalledWith(10);
  });
});
