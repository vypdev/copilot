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
