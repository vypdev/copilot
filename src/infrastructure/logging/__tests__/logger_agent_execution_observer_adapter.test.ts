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
            semanticCode: 'agent.policy-rejected', retryable: false,
        });

        expect(logInfo).toHaveBeenCalledWith(
            'Agent execution failed.',
            false,
            { agentExecution: expect.not.objectContaining({ prompt: expect.anything(), environment: expect.anything() }) },
        );
    });
});
