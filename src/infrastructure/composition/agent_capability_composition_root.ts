import type { FindingsQueryPort } from '../../application/ports/agent_findings_ports';
import type { FixerQueryPort } from '../../application/ports/agent_fixer_ports';
import type { AgentCliPort } from '../agents/ports/agent_provider_ports';
import { AgentCliClient } from '../../data/repository/agent_cli_client';

import { FindingsAgentAdapter } from '../../data/repository/ai/findings_agent_adapter';
import { FixerAgentAdapter } from '../../data/repository/ai/fixer_agent_adapter';

export interface AgentCapabilityCompositionInfrastructure {
    readonly cli: AgentCliPort;

}

function defaultInfrastructure(): AgentCapabilityCompositionInfrastructure {
    return {
        cli: new AgentCliClient(),

    };
}

export function createFindingsQueryPort(
    infrastructure: AgentCapabilityCompositionInfrastructure = defaultInfrastructure(),
): FindingsQueryPort {
    return new FindingsAgentAdapter(infrastructure);
}

export function createFixerQueryPort(
    infrastructure: AgentCapabilityCompositionInfrastructure = defaultInfrastructure(),
): FixerQueryPort {
    return new FixerAgentAdapter(infrastructure);
}
