import type { AgentExecutionFailureCategory, AgentExecutionSemanticCode } from '../ports/agent_execution_observation_ports';

/** Closed provider categories share the same semantic identity in telemetry and replies. */
export function agentExecutionFailureCode(category: AgentExecutionFailureCategory): AgentExecutionSemanticCode {
    if (category === 'configuration') return 'agent.policy-rejected';
    if (category === 'timeout') return 'timeout';
    if (category === 'cancelled') return 'workflow.cancelled';
    if (category === 'output') return 'provider.contract-invalid';
    return 'agent.failed';
}
