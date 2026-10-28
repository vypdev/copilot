import * as core from '@actions/core';
import { finishGithubAction } from '../github_action_completion';
import { Ai } from '../../data/model/ai';
import type { Execution } from '../../data/model/execution';
import { Result } from '../../data/model/result';
import { ApplicationError } from '../../application/errors/application_error';
import { CopilotEvidenceRepository } from '../../data/repository/copilot_evidence_repository';
import { logInfo } from '../../utils/logger';
jest.mock('@actions/core', () => ({ setOutput: jest.fn(), setFailed: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }));
const publish = jest.fn(), store = jest.fn();
jest.mock('../../application/usecases/steps/common/publish_resume_use_case', () => ({ PublishResultUseCase: jest.fn().mockImplementation(() => ({ invoke: publish })) }));
jest.mock('../../application/usecases/steps/common/store_configuration_use_case', () => ({ ...jest.requireActual('../../application/usecases/steps/common/store_configuration_use_case'), StoreConfigurationUseCase: jest.fn().mockImplementation(() => ({ invoke: store })) }));
const head = 'c'.repeat(40), previousToken = process.env.COPILOT_EVIDENCE_TOKEN, previousSha = process.env.GITHUB_SHA;
beforeEach(() => { jest.clearAllMocks(); publish.mockResolvedValue(undefined); store.mockResolvedValue(undefined); delete process.env.COPILOT_EVIDENCE_TOKEN; process.env.GITHUB_SHA = head; });
afterAll(() => { if (previousToken === undefined) delete process.env.COPILOT_EVIDENCE_TOKEN; else process.env.COPILOT_EVIDENCE_TOKEN = previousToken; if (previousSha === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = previousSha; });
function fixture(locale = 'en-US') {
    const action = { owner: 'owner', repo: 'repo', eventName: 'push', currentConfiguration: { results: [] }, isSingleAction: false, isIssue: true, isPullRequest: false, isPush: true, issue: { number: 728 }, pullRequest: { number: -1 }, labels: {}, locale: { repository: locale, issue: locale, pullRequest: locale }, singleAction: { issue: -1, throwError: false }, release: { active: false }, hotfix: { active: false }, tokens: { token: 'PRIVATE_PRODUCT_TOKEN' }, ai: new Ai('', 'model', false, [], false, 'low', 20) } as unknown as Execution;
    const create = jest.fn().mockRejectedValue({ status: 403, message: 'PRIVATE_PROVIDER_BODY', response: { headers: { 'x-github-request-id': 'AB12:CD34', authorization: 'PRIVATE_HEADER' } } });
    const getClient = jest.fn(() => ({ rest: { checks: { create } } })), summary = { publish: jest.fn().mockResolvedValue(undefined) };
    return { action, create, getClient, summary, evidence: new CopilotEvidenceRepository({ getClient }) };
}
it.each([undefined, '   ', '  PRIVATE_EVIDENCE_TOKEN  '])('selects the intended credential route without exposing it %#', async token => {
    if (token !== undefined) process.env.COPILOT_EVIDENCE_TOKEN = token;
    const f = fixture(), results = [new Result({ id: 'CheckProgressUseCase', success: true, executed: true })];
    await finishGithubAction(f.action, results, {} as never, {} as never, f.evidence, f.summary);
    expect(core.setFailed).not.toHaveBeenCalled(); expect(f.getClient).toHaveBeenCalledWith(token?.trim() || 'PRIVATE_PRODUCT_TOKEN');
    const text = f.summary.publish.mock.calls[1][0]; expect(text).toContain(token?.trim() ? 'credential-route=dedicated-evidence-token' : 'credential-route=action-token-fallback');
    expect(text).toContain(`head=${head}`); expect(text).toContain('status=403; request=AB12:CD34'); expect(text).not.toContain('PRIVATE');
    expect(jest.mocked(logInfo).mock.calls.map(([text]) => text).join('\n')).not.toContain('PRIVATE'); expect(results).toHaveLength(1); expect(results[0].success).toBe(true); expect(f.create).toHaveBeenCalledTimes(1);
});
it.each(['en-US', 'es-MX'])('retains the exact earlier required-stage failure in %s', async locale => {
    const f = fixture(locale), required = new ApplicationError('validation.evidence-unavailable', 'Original required source missing', { correlationId: '12345678-1234-4234-8234-123456789abc' });
    const results = [new Result({ id: 'CheckProgressUseCase', success: false, executed: true, errors: [required] })];
    await finishGithubAction(f.action, results, {} as never, {} as never, f.evidence, f.summary);
    expect(core.setFailed).toHaveBeenCalledTimes(1); expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(required.correlationId));
    expect(f.summary.publish.mock.calls[1][0]).toContain(locale.startsWith('es') ? 'Publicación del Check Run opcional' : 'Optional Check Run publication');
    expect(results[0].errors[0]).toBe(required); expect(results).toHaveLength(1); expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'failure', head_sha: head }));
});
it.each(['en-US', 'es-MX'])('keeps the log diagnostic and required failure when appending the Job Summary also fails in %s', async locale => {
    const f = fixture(locale), required = new ApplicationError('workflow.stale', 'Required target changed');
    f.summary.publish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('PRIVATE_SUMMARY_FAILURE'));
    await finishGithubAction(f.action, [new Result({ id: 'Required', success: false, executed: true, errors: [required] })], {} as never, {} as never, f.evidence, f.summary);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('workflow.stale'));
    expect(jest.mocked(logInfo).mock.calls.some(([text]) => text.includes('operation=checks.create'))).toBe(true);
    expect(jest.mocked(logInfo).mock.calls.map(([text]) => text).join('\n')).not.toContain('PRIVATE');
    expect(jest.mocked(logInfo).mock.calls.at(-1)![0]).toContain(locale.startsWith('es') ? 'se conserva en el log' : 'remains in the run log');
});
it('retains a failed single-action reporter result and its existing owned presentation', async () => {
    const f = fixture(); Object.assign(f.action, { isSingleAction: true, singleAction: { issue: 728, isDeploymentOrchestrationAction: true } });
    const required = new ApplicationError('workflow.failed', 'Package publication failed');
    await finishGithubAction(f.action, [new Result({ id: 'DeploymentOrchestrationUseCase', success: false, executed: true, errors: [required] })], {} as never, {} as never, f.evidence, f.summary);
    expect(publish).not.toHaveBeenCalled(); expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(required.correlationId)); expect(f.summary.publish).toHaveBeenCalledTimes(2);
});
it('logs an optional diagnostic when no Job Summary port is available', async () => {
    const f = fixture(); await finishGithubAction(f.action, [], {} as never, {} as never, f.evidence);
    expect(core.setFailed).not.toHaveBeenCalled(); expect(jest.mocked(logInfo).mock.calls.some(([text]) => text.includes('operation=checks.create'))).toBe(true);
});
it('does not append a warning or retry when native publication is confirmed', async () => {
    const f = fixture(); f.create.mockResolvedValue({ data: { id: 1 } });
    await finishGithubAction(f.action, [], {} as never, {} as never, f.evidence, f.summary);
    expect(f.summary.publish).toHaveBeenCalledTimes(1); expect(f.create).toHaveBeenCalledTimes(1); expect(core.setFailed).not.toHaveBeenCalled();
});
it('does not publish diagnostics or native evidence during dry-run', async () => {
    const f = fixture(); await finishGithubAction(f.action, [new Result({ id: 'DryRun', success: true, executed: true, payload: { dryRun: true } })], {} as never, {} as never, f.evidence, f.summary);
    expect(f.create).not.toHaveBeenCalled(); expect(f.summary.publish).toHaveBeenCalledTimes(1);
});
it('does not fabricate an immutable target for an ineligible single-action event', async () => {
    const f = fixture(); Object.assign(f.action, { eventName: 'workflow_dispatch', isPush: false, isSingleAction: true });
    await finishGithubAction(f.action, [], {} as never, {} as never, f.evidence, f.summary);
    expect(f.create).not.toHaveBeenCalled(); expect(f.summary.publish).toHaveBeenCalledTimes(1);
});

it('contains a private semantic error from a custom adapter without treating it as a provider outage', async () => {
    const f = fixture(), error = new ApplicationError('provider.unavailable', 'PRIVATE_ADAPTER_MESSAGE');
    await finishGithubAction(f.action, [], {} as never, {} as never, { publish: jest.fn().mockRejectedValue(error) }, f.summary);
    const logs = jest.mocked(logInfo).mock.calls.map(([text]) => text).join('\n');
    expect(logs).not.toContain('PRIVATE_ADAPTER_MESSAGE'); expect(logs).toContain('underlying cause is not established');
    expect(core.setFailed).not.toHaveBeenCalled();
});
