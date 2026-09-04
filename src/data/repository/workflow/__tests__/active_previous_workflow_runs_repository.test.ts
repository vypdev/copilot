import { WORKFLOW_STATUS } from '../workflow_status';
import type {
  GithubWorkflowRun,
  GithubWorkflowRunsClient,
  GithubWorkflowRunsResponse,
} from '../../../../infrastructure/github/ports/github_workflow_provider_ports';
import { ActivePreviousWorkflowRunsRepository } from '../active_previous_workflow_runs_repository';
import { COPILOT_WORKFLOW_NAMES } from '../../../../application/policies/workflow_queue_policy';
import { WORKFLOW_ACTIVE_STATUSES } from '../workflow_status';

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

const query = {
  owner: 'org',
  repository: 'repo',
  currentRunId: 200,
  workflowName: 'Copilot - Issue',
  workflowNames: ['Copilot - Issue', 'Task - Release'],
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

  it('uses one repository traversal and locally filters mixed statuses and workflow names', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 198, name: 'Task - Release', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 200, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 201, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 197, name: 'Unrelated workflow', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 196, name: 'Copilot - Issue', status: WORKFLOW_STATUS.COMPLETED }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(2);
    expect(iterator).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
    });
  });

  it('detects an older active matching run on a later page', async () => {
    iterator.mockImplementation(async function* () {
      yield { data: { workflow_runs: [] } } as GithubWorkflowRunsResponse;
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 150, name: 'Task - Release', status: WORKFLOW_STATUS.WAITING }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns(query)).resolves.toBe(1);
    expect(iterator).toHaveBeenCalledTimes(1);
  });

    it('counts all eight shared workflow names and five active statuses across every page', async () => {
    const runs = COPILOT_WORKFLOW_NAMES.flatMap((name, nameIndex) => WORKFLOW_ACTIVE_STATUSES.map((status, statusIndex) => workflowRun({
      id: 1 + nameIndex * WORKFLOW_ACTIVE_STATUSES.length + statusIndex,
      name,
      status,
    })));
    iterator.mockImplementation(async function* () {
      yield { data: { workflow_runs: runs.slice(0, 17) } } as GithubWorkflowRunsResponse;
      yield { data: { workflow_runs: runs.slice(17) } } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      ...query,
      workflowNames: [...COPILOT_WORKFLOW_NAMES],
    })).resolves.toBe(COPILOT_WORKFLOW_NAMES.length * WORKFLOW_ACTIVE_STATUSES.length);
    expect(iterator).toHaveBeenCalledTimes(1);
  });

  it('counts multiple earlier queue runs while excluding cancelled and skipped terminals', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [
            workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.IN_PROGRESS }),
            workflowRun({ id: 198, name: 'Task - Release', status: WORKFLOW_STATUS.QUEUED }),
            workflowRun({ id: 197, name: 'Copilot - Commit', status: WORKFLOW_STATUS.CANCELLED }),
            workflowRun({ id: 196, name: 'Copilot - Pull Request', status: WORKFLOW_STATUS.SKIPPED }),
            workflowRun({ id: 200, name: 'Copilot - Issue Comment', status: WORKFLOW_STATUS.IN_PROGRESS }),
          ],
        },
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      ...query,
      workflowNames: [
        'Copilot - Issue',
        'Copilot - Issue Comment',
        'Task - Release',
        'Copilot - Commit',
        'Copilot - Pull Request',
      ],
    })).resolves.toBe(2);
  });

  it('supports both Octokit page shapes and the compatibility workflow endpoint', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: [workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.PENDING })],
      } as GithubWorkflowRunsResponse;
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      ...query,
      workflowNames: undefined,
      workflowIdentifier: 'copilot_issue.yml',
    })).resolves.toBe(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
    });
  });

  it('falls back to repository traversal when the workflow endpoint is unavailable', async () => {
    iterator.mockImplementation(async function* () {
      yield {
        data: {
          workflow_runs: [workflowRun({ id: 199, name: 'Copilot - Issue', status: WORKFLOW_STATUS.PENDING })],
        },
      } as GithubWorkflowRunsResponse;
    });
    const fallbackClient = {
      rest: { actions: { listWorkflowRunsForRepo } },
      paginate: { iterator },
    } as unknown as GithubWorkflowRunsClient;
    const repository = new ActivePreviousWorkflowRunsRepository(fallbackClient);

    await expect(repository.countActivePreviousRuns({
      ...query,
      workflowNames: undefined,
      workflowIdentifier: 'copilot_issue.yml',
    })).resolves.toBe(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
    });
  });

  it('does not switch endpoints after a scoped provider failure', async () => {
    iterator.mockImplementation(async function* () {
      yield* [];
      throw { status: 404 };
    });
    const repository = new ActivePreviousWorkflowRunsRepository(client);

    await expect(repository.countActivePreviousRuns({
      ...query,
      workflowNames: undefined,
      workflowIdentifier: 'copilot_issue.yml',
    })).rejects.toMatchObject({ status: 404 });
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
    });
    expect(iterator).not.toHaveBeenCalledWith(listWorkflowRunsForRepo, expect.anything());
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
        data: { workflow_runs: [workflowRun({ id: 150, name: 'Task - Release', status: WORKFLOW_STATUS.QUEUED })] },
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
