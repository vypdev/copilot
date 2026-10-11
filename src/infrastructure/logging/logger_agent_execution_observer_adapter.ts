import { AGENT_EXECUTION_OUTPUT_DIAGNOSTICS } from '../../application/ports/agent_execution_observation_ports';
import type {
    AgentExecutionObservation,
    AgentExecutionObserverPort,
} from '../../application/ports/agent_execution_observation_ports';
import { isSafeAgentRuntimeVersion } from '../agents/agent_runtime_manifest';
import { logDebugInfo, logInfo } from '../../utils/logger';

export class LoggerAgentExecutionObserverAdapter implements AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void {
        if (observation.state === 'failed') {
            const outputDiagnostic = observation.phase === 'run' && observation.failureCategory === 'output'
                ? AGENT_EXECUTION_OUTPUT_DIAGNOSTICS.find(code => code === observation.outputDiagnostic) ?? 'unclassified'
                : undefined;
            const output = outputDiagnostic ? `, ${outputDiagnostic}` : '';
            const exit = observation.exitCode === undefined ? '' : `, exit ${observation.exitCode}`;
            const diagnostic = observation.exitDiagnostic ? `, ${observation.exitDiagnostic}` : '';
            const stage = observation.preflightStage ? `, stage ${observation.preflightStage}` : '';
            const preflightDiagnostic = observation.preflightDiagnostic ? `, ${observation.preflightDiagnostic}` : '';
            logInfo(`Agent execution failed (${observation.phase}/${observation.failureCategory}${stage}${preflightDiagnostic}${exit}${diagnostic}${output}).`, false,
                { agentExecution: { ...observation, outputDiagnostic } });
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
