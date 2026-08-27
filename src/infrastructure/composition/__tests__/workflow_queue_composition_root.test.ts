import * as github from '@actions/github';
import { createWaitForPreviousWorkflowRunsUseCase } from '../workflow_queue_composition_root';

jest.mock('@actions/github');

describe('workflow queue composition root', () => {
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
    });
  });
});
