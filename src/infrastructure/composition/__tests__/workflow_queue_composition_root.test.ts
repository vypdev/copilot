import * as github from '@actions/github';
import { createWaitForPreviousWorkflowRunsUseCase } from '../workflow_queue_composition_root';
import { WORKFLOW_ACTIVE_STATUSES, WORKFLOW_STATUS } from '../../../utils/constants';

jest.mock('@actions/github');

describe('workflow queue composition root', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wires the active-run query to the GitHub workflow client', async () => {
    const listWorkflowRunsForRepo = jest.fn();
    const iterator = jest.fn().mockImplementation(async function* () {
      yield { data: { workflow_runs: [] } };
    });
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { actions: { listWorkflowRunsForRepo } },
      paginate: { iterator },
    });

    const useCase = createWaitForPreviousWorkflowRunsUseCase('token');
    await useCase.invoke({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
    });

    expect(github.getOctokit).toHaveBeenCalledWith('token');
    expect(github.getOctokit).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRunsForRepo, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      status: WORKFLOW_STATUS.IN_PROGRESS,
    });
    expect(iterator).toHaveBeenCalledTimes(WORKFLOW_ACTIVE_STATUSES.length);
  });

  it('uses the workflow-scoped endpoint when the workflow identifier is available', async () => {
    const listWorkflowRunsForRepo = jest.fn();
    const listWorkflowRuns = jest.fn();
    const iterator = jest.fn().mockImplementation(async function* () {
      yield { data: [] };
    });
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { actions: { listWorkflowRunsForRepo, listWorkflowRuns } },
      paginate: { iterator },
    });

    const useCase = createWaitForPreviousWorkflowRunsUseCase('token');
    await useCase.invoke({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowName: 'CI',
      workflowIdentifier: 'copilot_issue.yml',
    });

    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      status: WORKFLOW_STATUS.IN_PROGRESS,
      workflow_id: 'copilot_issue.yml',
    });
    expect(iterator).not.toHaveBeenCalledWith(listWorkflowRunsForRepo, expect.anything());
  });
});
