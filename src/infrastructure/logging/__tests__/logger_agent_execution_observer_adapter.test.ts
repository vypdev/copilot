import { logDebugInfo, logInfo } from '../../../utils/logger';
import { LoggerAgentExecutionObserverAdapter } from '../logger_agent_execution_observer_adapter';

jest.mock('../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logInfo: jest.fn(),
}));

describe('LoggerAgentExecutionObserverAdapter', () => {
    it('keeps planning detail in debug logs and emits terminal observations', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({ state: 'started', phase: 'plan', provider: 'codex', capability: 'findings' });
        observer.observe({
            state: 'completed', phase: 'run', provider: 'codex', capability: 'findings',
            durationMilliseconds: 25, outputBytes: 5,
        });

        expect(logDebugInfo).toHaveBeenCalledWith(
            'Agent execution started.',
            false,
            { agentExecution: expect.objectContaining({ phase: 'plan', provider: 'codex' }) },
        );
        expect(logInfo).toHaveBeenCalledWith(
            'Agent execution completed.',
            false,
            { agentExecution: expect.objectContaining({ phase: 'run', outputBytes: 5 }) },
        );
    });

    it.each(['reported-sandbox-setup-mutex', 'PRIVATE_FORGED_PROVIDER_TEXT'] as const)(
        'admits only a closed sandbox tool hint on CLI completion: %s', value => {
            const observer = new LoggerAgentExecutionObserverAdapter();
            observer.observe({state:'completed', phase:'run', provider:'codex', capability:'findings', durationMilliseconds:10,
                outputBytes:20, toolDiagnostic:value as never});
            const expected = value === 'reported-sandbox-setup-mutex' ? value : undefined;
            expect(logInfo).toHaveBeenCalledWith(value === 'reported-sandbox-setup-mutex'
                ? 'Agent CLI completed; provider reported a sandbox tool failure (reported-sandbox-setup-mutex). Inspect the runner sandbox setup.'
                : 'Agent execution completed.', false, {agentExecution:expect.objectContaining({toolDiagnostic:expected})});
            expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('PRIVATE_FORGED_PROVIDER_TEXT');
        });

    it('emits only semantic failure metadata', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({
            state: 'failed', phase: 'preflight', provider: 'cursor', capability: 'fixer',
            durationMilliseconds: 10, failureCategory: 'configuration',
            semanticCode: 'agent.policy-rejected', retryable: false, preflightStage: 'invocation-trust',
        });

        expect(logInfo).toHaveBeenCalledWith(
            'Agent execution failed (preflight/configuration, stage invocation-trust).',
            false,
            { agentExecution: expect.not.objectContaining({ prompt: expect.anything(), environment: expect.anything() }) },
        );
    });

    it('logs only the closed Windows ACL reason after a rejected preflight', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({
            state: 'failed', phase: 'preflight', provider: 'codex', capability: 'findings',
            durationMilliseconds: 10, failureCategory: 'configuration', semanticCode: 'agent.policy-rejected',
            retryable: false, preflightStage: 'invocation-trust', preflightDiagnostic: 'acl-ancestor-owner',
        });
        expect(logInfo).toHaveBeenCalledWith(
            'Agent execution failed (preflight/configuration, stage invocation-trust, acl-ancestor-owner).',
            false,
            { agentExecution: expect.objectContaining({ preflightDiagnostic: 'acl-ancestor-owner' }) },
        );
    });

    it('reports only the sanitized version identity and numeric exit code', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({
            state: 'admitted', phase: 'preflight', provider: 'codex', capability: 'findings',
            durationMilliseconds: 5, manifestRevision: 'fixture', version: 'codex-cli 9.0',
            workspaceMode: 'read-only', outputContract: 'text', artifactHashes: [],
        });
        observer.observe({
            state: 'failed', phase: 'run', provider: 'codex', capability: 'findings',
            durationMilliseconds: 10, failureCategory: 'process', semanticCode: 'agent.failed',
            retryable: false, exitCode: 2,
        });
        expect(logDebugInfo).toHaveBeenCalledWith('Agent execution admitted (codex codex-cli 9.0).', false,
            { agentExecution: expect.objectContaining({ version: 'codex-cli 9.0' }) });
        expect(logInfo).toHaveBeenCalledWith('Agent execution failed (run/process, exit 2).', false,
            { agentExecution: expect.not.objectContaining({ prompt: expect.anything(), environment: expect.anything() }) });
    });

    it('does not interpolate or attach an unvalidated version from a direct observation', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({
            state: 'admitted', phase: 'preflight', provider: 'codex', capability: 'findings',
            durationMilliseconds: 5, manifestRevision: 'fixture', version: '9.0\rFORGED\u001b[31m',
            workspaceMode: 'read-only', outputContract: 'text', artifactHashes: [],
        });
        expect(logDebugInfo).toHaveBeenCalledWith('Agent execution admitted (codex invalid-version).', false,
            { agentExecution: expect.objectContaining({ version: 'invalid-version' }) });
        expect(JSON.stringify((logDebugInfo as jest.Mock).mock.calls)).not.toContain('FORGED');
    });

    it.each(['output-limit', 'empty-output', 'malformed-json-event', 'invalid-json-event', 'missing-text-events', 'unclassified'] as const)(
        'emits the closed output rejection reason %s without provider content', outputDiagnostic => {
            const observer = new LoggerAgentExecutionObserverAdapter();
            observer.observe({ state: 'failed', phase: 'run', provider: 'codex', capability: 'fixer', durationMilliseconds: 10,
                failureCategory: 'output', semanticCode: 'provider.contract-invalid', retryable: false, outputDiagnostic });
            expect(logInfo).toHaveBeenCalledWith(`Agent execution failed (run/output, ${outputDiagnostic}).`, false,
                { agentExecution: expect.objectContaining({ outputDiagnostic }) });
        },
    );
    it('does not interpolate or attach a forged output diagnostic', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({ state: 'failed', phase: 'run', provider: 'codex', capability: 'fixer', durationMilliseconds: 10,
            failureCategory: 'output', semanticCode: 'provider.contract-invalid', retryable: false, outputDiagnostic: 'SECRET_PROVIDER_OUTPUT' as never });
        expect(logInfo).toHaveBeenCalledWith('Agent execution failed (run/output, unclassified).', false,
            { agentExecution: expect.objectContaining({ outputDiagnostic: 'unclassified' }) });
        expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('SECRET_PROVIDER_OUTPUT');
    });

    it('logs only the fixed diagnostic code after a failed CLI process', () => {
        const observer = new LoggerAgentExecutionObserverAdapter();
        observer.observe({
            state: 'failed', phase: 'run', provider: 'codex', capability: 'findings',
            durationMilliseconds: 10, failureCategory: 'process', semanticCode: 'agent.failed',
            retryable: false, exitCode: 1, exitDiagnostic: 'reported-model-unavailable',
        });
        expect(logInfo).toHaveBeenCalledWith(
            'Agent execution failed (run/process, exit 1, reported-model-unavailable).',
            false,
            { agentExecution: expect.objectContaining({ exitDiagnostic: 'reported-model-unavailable' }) },
        );
    });
});
