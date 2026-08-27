import type { GithubWorkflowDispatchClient } from '../../../../infrastructure/github/ports/github_workflow_provider_ports';
import type { GithubClientPort } from '../../../../infrastructure/github/ports/github_client_provider_port';
import { WorkflowDispatchRepository } from '../workflow_dispatch_repository';

const createWorkflowDispatch = jest.fn();
const client = { rest: { actions: { createWorkflowDispatch } } } as unknown as GithubWorkflowDispatchClient;
const clientProvider: GithubClientPort<GithubWorkflowDispatchClient> = {
  getClient: jest.fn(() => client),
};

describe('WorkflowDispatchRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('dispatches the requested workflow through the provider client', async () => {
    createWorkflowDispatch.mockResolvedValue(undefined);
    const repository = new WorkflowDispatchRepository(clientProvider);

    await repository.executeWorkflow(
      'org',
      'repo',
      'main',
      'deploy.yml',
      { environment: 'staging' },
      'token',
    );

    expect(clientProvider.getClient).toHaveBeenCalledWith('token');
    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      workflow_id: 'deploy.yml',
      ref: 'main',
      inputs: { environment: 'staging' },
    });
  });
});
