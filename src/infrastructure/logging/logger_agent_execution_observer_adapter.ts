import type {
    AgentExecutionObservation,
    AgentExecutionObserverPort,
} from '../../application/ports/agent_execution_observation_ports';
import { logDebugInfo, logInfo } from '../../utils/logger';

export class LoggerAgentExecutionObserverAdapter implements AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void {
        if (observation.state === 'failed') {
            const exit = observation.exitCode === undefined ? '' : `, exit ${observation.exitCode}`;
            logInfo(`Agent execution failed (${observation.phase}/${observation.failureCategory}${exit}).`, false,
                { agentExecution: observation });
            return;
        }
        if (observation.state === 'completed') {
            logInfo('Agent execution completed.', false, { agentExecution: observation });
            return;
        }
        if (observation.state === 'admitted') {
            logDebugInfo(`Agent execution admitted (${observation.provider} ${observation.version}).`, false,
                { agentExecution: observation });
            return;
        }
        logDebugInfo(`Agent execution ${observation.state}.`, false, { agentExecution: observation });
    }
}
