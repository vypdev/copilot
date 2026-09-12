import type {
    AgentExecutionObservation,
    AgentExecutionObserverPort,
} from '../../application/ports/agent_execution_observation_ports';
import { logDebugInfo, logInfo } from '../../utils/logger';

export class LoggerAgentExecutionObserverAdapter implements AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void {
        if (observation.state === 'completed' || observation.state === 'failed') {
            logInfo(`Agent execution ${observation.state}.`, false, { agentExecution: observation });
            return;
        }
        logDebugInfo(`Agent execution ${observation.state}.`, false, { agentExecution: observation });
    }
}
