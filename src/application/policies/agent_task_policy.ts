import type { CopilotCommandName } from '../../domain/copilot_command';
import type { AgentTask } from '../../domain/agent';

/** Agent capability used by the existing provider adapters for structured work. */
export const AGENT_PLAN = 'build';

/**
 * Selects the least-privileged specialist for an interactive Copilot request.
 * Optional role configurations fall back to the default findings configuration
 * in Ai, so existing installations keep working without new inputs.
 */
export function resolveThinkAgentTask(
    commandName: CopilotCommandName | undefined,
    destinationType: 'issue' | 'PR',
): AgentTask {
    switch (commandName) {
        case 'test-plan':
            return 'tester';
        case 'review':
            return 'reviewer';
        case 'findings':
        case 'recheck':
            return destinationType === 'PR' ? 'reviewer' : 'findings';
        default:
            return 'planner';
    }
}
