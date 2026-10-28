import * as core from '@actions/core';
import * as github from '@actions/github';
import { ApplicationError } from '../../application/errors/application_error';
import { DeploymentCandidatePreflightBlockedError, DeploymentCandidatePreflightWorkflow,
  type DeploymentCandidatePreflightOutcome } from '../../application/usecases/execution/deployment_candidate_preflight_workflow';
import { createDeploymentCandidatePreflightPorts } from '../../infrastructure/composition/deployment_candidate_replacement_composition_root';
import { runDeploymentCandidatePreflightAction } from '../deployment_candidate_preflight_action';

jest.mock('@actions/core', () => ({ getInput: jest.fn(), setOutput: jest.fn(), setFailed: jest.fn(),
  summary: { addRaw: jest.fn().mockReturnThis(), write: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('@actions/github', () => ({ context: { repo: { owner: 'owner', repo: 'project' }, eventName: 'workflow_dispatch',
  ref: 'refs/heads/release/1.5.2', sha: 'b'.repeat(40), payload: { inputs: { mode: 'replace' } } } }));
jest.mock('../../infrastructure/composition/deployment_candidate_replacement_composition_root', () => ({ createDeploymentCandidatePreflightPorts: jest.fn().mockReturnValue({}) }));

const values: Record<string, string> = { token: 'PRIVATE_PRODUCT_TOKEN', issue: '170', 'operation-id': 'operation-previous',
  'expected-revision': '3', version: '1.5.2', 'source-sha': 'b'.repeat(40), 'confirm-unpublished': 'true',
  'issue-workflow-profile': '', 'repository-locale': 'en-US', 'release-label': 'release', 'hotfix-label': 'hotfix' };
const result: DeploymentCandidatePreflightOutcome = { mode: 'prepare', issue: 170, version: '1.5.2', previousPromotion: 173,
  sourceBranch: 'release/1.5.2', candidateSha: 'b'.repeat(40), reviewedSourceSha: 'b'.repeat(40), productionBaseSha: 'c'.repeat(40),
  operationId: 'operation-previous', expectedRevision: 3, currentOperationId: 'operation-previous', currentRevision: 3 };
let invoke: jest.SpyInstance;
const before = { runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, vars: process.env.INPUT_VARS_JSON };
beforeEach(() => {
  jest.clearAllMocks(); process.env.GITHUB_RUN_ID = '50'; process.env.GITHUB_RUN_ATTEMPT = '1';
  (core.getInput as jest.Mock).mockImplementation((key: string) => values[key] ?? '');
  (core.summary.write as jest.Mock).mockResolvedValue(undefined);
  invoke = jest.spyOn(DeploymentCandidatePreflightWorkflow.prototype, 'invoke').mockResolvedValue(result);
  (github.context as any).payload = { inputs: { mode: 'replace' } };
});
afterEach(() => {
  invoke.mockRestore();
  for (const [key, value] of Object.entries({ GITHUB_RUN_ID: before.runId, GITHUB_RUN_ATTEMPT: before.attempt, INPUT_VARS_JSON: before.vars })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
it('reads declared inputs directly and emits only bounded native proof outputs after successful Summary publication', async () => {
  process.env.INPUT_VARS_JSON = JSON.stringify({ token: 'PRIVATE_OVERRIDE', issue: '999', 'source-sha': 'x' });
  await runDeploymentCandidatePreflightAction();
  expect(createDeploymentCandidatePreflightPorts).toHaveBeenCalledWith({ owner: 'owner', repository: 'project', token: values.token });
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-previous', expectedRevision: 3,
    issue: 170, reviewedSourceSha: result.reviewedSourceSha, confirmedUnpublished: true, runId: 50, runAttempt: 1,
    eventName: 'workflow_dispatch', eventMode: 'replace', repositoryFullName: 'owner/project', headBranch: result.sourceBranch }));
  expect(core.getInput).toHaveBeenCalledWith('source-sha', { trimWhitespace: false });
  expect((core.setOutput as jest.Mock).mock.calls).toEqual([
    ['mode', 'prepare'], ['source-branch', result.sourceBranch], ['candidate-sha', result.candidateSha],
    ['production-base-sha', result.productionBaseSha], ['operation-id', result.operationId], ['expected-revision', 3],
  ]);
  expect(core.setFailed).not.toHaveBeenCalled(); expect(JSON.stringify((core.summary.addRaw as jest.Mock).mock.calls)).not.toMatch(/PRIVATE_PRODUCT_TOKEN|PRIVATE_OVERRIDE/);
});
it.each(['recover', 'recorded'] as const)('forwards the closed outcome %s without selecting a full runner itself', async mode => {
  invoke.mockResolvedValueOnce({ ...result, mode, candidateSha: 'f'.repeat(40), currentOperationId: 'operation-successor', currentRevision: 4 });
  await runDeploymentCandidatePreflightAction(); expect(core.setOutput).toHaveBeenCalledWith('mode', mode);
  expect(core.setFailed).not.toHaveBeenCalled();
});
it.each([new Error('PRIVATE_SDK_BODY_URL_TOKEN'), new ApplicationError('provider.unavailable', 'PRIVATE_SEMANTIC_BODY_URL_TOKEN')])(
  'does not leak raw or custom semantic error prose or emit candidate outputs after failure', async error => {
    invoke.mockRejectedValueOnce(error); await runDeploymentCandidatePreflightAction();
    expect(core.setOutput).not.toHaveBeenCalled(); expect(core.setFailed).toHaveBeenCalledWith('provider.unavailable: native-proof-unavailable');
    expect(JSON.stringify([(core.summary.addRaw as jest.Mock).mock.calls, (core.setFailed as jest.Mock).mock.calls])).not.toMatch(/PRIVATE|BODY_URL|TOKEN/);
  });
it('keeps a closed validation reason inspectable while normalizing an unrecognized reason', async () => {
  invoke.mockRejectedValueOnce(new DeploymentCandidatePreflightBlockedError('changed-source'));
  await runDeploymentCandidatePreflightAction(); expect(core.setFailed).toHaveBeenCalledWith('workflow.stale: changed-source');
  invoke.mockRejectedValueOnce(new DeploymentCandidatePreflightBlockedError('PRIVATE_ARBITRARY_REASON'));
  await runDeploymentCandidatePreflightAction(); expect(core.setFailed).toHaveBeenLastCalledWith('workflow.stale: native-proof-unavailable');
  expect(JSON.stringify((core.summary.addRaw as jest.Mock).mock.calls)).not.toContain('PRIVATE_ARBITRARY_REASON');
});
it('rejects missing token before any native composition or output', async () => {
  (core.getInput as jest.Mock).mockImplementation((key: string) => key === 'token' ? '' : values[key] ?? '');
  await runDeploymentCandidatePreflightAction(); expect(createDeploymentCandidatePreflightPorts).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled(); expect(core.setOutput).not.toHaveBeenCalled(); expect(core.setFailed).toHaveBeenCalled();
});
it('does not invent a run ID, attempt or caller mode when native environment evidence is missing', async () => {
  delete process.env.GITHUB_RUN_ID; delete process.env.GITHUB_RUN_ATTEMPT; (github.context as any).payload = {};
  await runDeploymentCandidatePreflightAction(); expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ runId: -1, runAttempt: -1, eventMode: '' }));
});
it('fails safely without success outputs when Summary publication fails, even if the failure Summary also fails', async () => {
  (core.summary.write as jest.Mock).mockRejectedValue(new Error('PRIVATE_SUMMARY_FAILURE'));
  await runDeploymentCandidatePreflightAction(); expect(core.setFailed).toHaveBeenCalled(); expect(core.setOutput).not.toHaveBeenCalled();
  expect(JSON.stringify((core.setFailed as jest.Mock).mock.calls)).not.toContain('PRIVATE_SUMMARY_FAILURE');
});
it.each([
  ['es-ES', 'La comprobación previa'], ['fr-FR', 'Candidate replacement preflight'],
])('uses the complete static Summary language for %s without any planner call', async (locale, expected) => {
  (core.getInput as jest.Mock).mockImplementation((key: string) => key === 'repository-locale' ? locale : values[key] ?? '');
  invoke.mockRejectedValueOnce(new Error('PRIVATE_FAILURE')); await runDeploymentCandidatePreflightAction();
  expect((core.summary.addRaw as jest.Mock).mock.calls[0][0]).toContain(expected);
});

it('retains closed invalid defaults for missing declared numeric intent and kind labels', async () => {
  (core.getInput as jest.Mock).mockImplementation((key: string) => ['repository-locale', 'expected-revision', 'issue', 'release-label', 'hotfix-label'].includes(key) ? '' : values[key] ?? '');
  await runDeploymentCandidatePreflightAction(); expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ issue: -1, expectedRevision: -1, releaseLabel: 'release', hotfixLabel: 'hotfix' }));
});
