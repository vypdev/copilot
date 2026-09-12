import type { AgentConfiguration } from '../../../../../domain/agent';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { AGENT_PLAN } from '../../../../../application/policies/agent_task_policy';
import { BUGBOT_RESPONSE_SCHEMA } from './schema';

export async function queryBugbotFindings(
    repository: FindingsQueryPort,
    configuration: Readonly<AgentConfiguration>,
    prompt: string,
): Promise<unknown> {
    return repository.query({
        configuration,
        agentId: AGENT_PLAN,
        prompt,
        options: {
            expectJson: true,
            schema: BUGBOT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'bugbot_findings',
        },
    });
}
