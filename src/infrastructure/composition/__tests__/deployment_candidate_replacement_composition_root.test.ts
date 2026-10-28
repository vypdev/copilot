import * as github from '@actions/github';
import { GithubCandidateReplacementRepository } from '../../../data/repository/deployment/github_candidate_replacement_repository';
import { createDeploymentCandidateInspection, createDeploymentCandidatePreflightPorts } from '../deployment_candidate_replacement_composition_root';
jest.mock('../../../data/repository/deployment/github_candidate_replacement_repository');
jest.mock('../../github/octokit_deployment_adapter', () => ({ OctokitDeploymentClientAdapter: jest.fn() }));
const binding = { owner: 'owner', repository: 'project', token: 'PRIVATE_PRODUCT_TOKEN' };
beforeEach(() => { jest.clearAllMocks(); Object.assign(github.context, { repo: { owner: 'owner', repo: 'project' }, eventName: 'workflow_dispatch', payload: { inputs: { mode: 'replace' } }, runId: 50, sha: 'a'.repeat(40) }); process.env.GITHUB_JOB = 'promote'; process.env.GITHUB_RUN_ATTEMPT = '2'; });
afterEach(() => { delete process.env.GITHUB_JOB; delete process.env.GITHUB_RUN_ATTEMPT; });
it('captures immutable native invocation scope independently from action proof arguments', async () => {
  const port = createDeploymentCandidateInspection(binding); const mock = jest.mocked(GithubCandidateReplacementRepository); const scope = mock.mock.calls[0][1];
  expect(scope).toEqual({ repositoryFullName: 'owner/project', eventName: 'workflow_dispatch', eventMode: 'replace', job: 'promote', runId: 50, runAttempt: 2, headSha: 'a'.repeat(40) }); expect(Object.isFrozen(scope)).toBe(true); expect(Object.isFrozen(port)).toBe(true);
  const inspect = mock.mock.instances[0].inspect as jest.Mock; inspect.mockResolvedValue('facts');
  const command = { issue: 170, owner: 'foreign', token: 'other' } as any;
  expect(await port.inspect(command)).toBe('facts'); expect(inspect).toHaveBeenCalledWith({ ...command, ...binding });
});
it('exposes only readonly bound capabilities to preflight and never a producer-proof scope', async () => {
  const port = createDeploymentCandidatePreflightPorts(binding); const mock = jest.mocked(GithubCandidateReplacementRepository); expect(mock.mock.calls[0]).toHaveLength(1); expect(Object.keys(port).sort()).toEqual(['inspect', 'readLauncher', 'readWorkflowRun']);
  await port.inspect({ issue: 170 } as any); await port.readLauncher(170); await port.readWorkflowRun(50);
  expect(mock.mock.instances[0].inspect).toHaveBeenCalledWith({ issue: 170, ...binding }); expect(mock.mock.instances[0].readLauncher).toHaveBeenCalledWith({ ...binding, issue: 170 }); expect(mock.mock.instances[0].readWorkflowRun).toHaveBeenCalledWith({ ...binding, runId: 50 });
});
it('keeps absent native scope fields invalid instead of inventing workflow proof', () => {
  github.context.payload = {}; delete process.env.GITHUB_JOB; delete process.env.GITHUB_RUN_ATTEMPT;
  createDeploymentCandidateInspection(binding); expect(jest.mocked(GithubCandidateReplacementRepository).mock.calls[0][1]).toMatchObject({ eventMode: '', job: '', runAttempt: NaN });
});
