import * as github from '@actions/github';
import { createWaitForPreviousWorkflowRunsUseCase } from '../workflow_queue_composition_root';
import { WORKFLOW_ACTIVE_STATUSES } from '../../../data/repository/workflow/workflow_status';


jest.mock('@actions/github');

describe('workflow queue composition root', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wires the active-run query to the GitHub workflow client', async () => {
    const listWorkflowRuns = jest.fn();
    const iterator = jest.fn().mockImplementation(async function* () {
      yield { data: { workflow_runs: [] } };
    });
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { actions: { listWorkflowRuns } },
      paginate: { iterator },
    });

    const useCase = createWaitForPreviousWorkflowRunsUseCase('token');
    await useCase.invoke({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowIdentifier: 'copilot_issue.yml',
    });

    expect(github.getOctokit).toHaveBeenCalledWith('token');
    expect(github.getOctokit).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledTimes(WORKFLOW_ACTIVE_STATUSES.length);
    for (const status of WORKFLOW_ACTIVE_STATUSES) {
      expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
        owner: 'org',
        repo: 'repo',
        per_page: 100,
        workflow_id: 'copilot_issue.yml',
        status,
      });
    }
  });

  it('uses the workflow-scoped endpoint when the workflow identifier is available', async () => {
    const listWorkflowRuns = jest.fn();
    const iterator = jest.fn().mockImplementation(async function* () {
      yield { data: [] };
    });
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: { actions: { listWorkflowRuns } },
      paginate: { iterator },
    });

    const useCase = createWaitForPreviousWorkflowRunsUseCase('token');
    await useCase.invoke({
      owner: 'org',
      repository: 'repo',
      currentRunId: 200,
      workflowIdentifier: 'copilot_issue.yml',
    });

    expect(iterator).toHaveBeenCalledTimes(WORKFLOW_ACTIVE_STATUSES.length);
    expect(iterator).toHaveBeenCalledWith(listWorkflowRuns, {
      owner: 'org',
      repo: 'repo',
      per_page: 100,
      workflow_id: 'copilot_issue.yml',
      status: 'in_progress',
    });
  });
});
