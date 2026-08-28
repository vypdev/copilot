import type { Execution } from '../../../../../data/model/execution';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { AGENT_PLAN } from '../../../../../application/policies/agent_task_policy';
import { BUGBOT_RESPONSE_SCHEMA } from './schema';

export async function queryBugbotFindings(
    repository: FindingsQueryPort,
    execution: Execution,
    prompt: string,
): Promise<unknown> {
    return repository.query({
        configuration: execution.ai?.getAgentConfiguration('findings'),
        agentId: AGENT_PLAN,
        prompt,
        options: {
            expectJson: true,
            schema: BUGBOT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'bugbot_findings',
        },
    });
}
