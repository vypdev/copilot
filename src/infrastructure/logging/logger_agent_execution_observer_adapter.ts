import type {
    AgentExecutionObservation,
    AgentExecutionObserverPort,
} from '../../application/ports/agent_execution_observation_ports';
import { isSafeAgentRuntimeVersion } from '../agents/agent_runtime_manifest';
import { logDebugInfo, logInfo } from '../../utils/logger';

export class LoggerAgentExecutionObserverAdapter implements AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void {
        if (observation.state === 'failed') {
            const exit = observation.exitCode === undefined ? '' : `, exit ${observation.exitCode}`;
            const diagnostic = observation.exitDiagnostic ? `, ${observation.exitDiagnostic}` : '';
            const stage = observation.preflightStage ? `, stage ${observation.preflightStage}` : '';
            const preflightDiagnostic = observation.preflightDiagnostic ? `, ${observation.preflightDiagnostic}` : '';
            logInfo(`Agent execution failed (${observation.phase}/${observation.failureCategory}${stage}${preflightDiagnostic}${exit}${diagnostic}).`, false,
                { agentExecution: observation });
            return;
        }
        if (observation.state === 'completed') {
            logInfo('Agent execution completed.', false, { agentExecution: observation });
            return;
        }
        if (observation.state === 'admitted') {
            const version = isSafeAgentRuntimeVersion(observation.version) ? observation.version : 'invalid-version';
            logDebugInfo(`Agent execution admitted (${observation.provider} ${version}).`, false,
                { agentExecution: { ...observation, version } });
            return;
        }
        logDebugInfo(`Agent execution ${observation.state}.`, false, { agentExecution: observation });
    }
}
