import type { BoundBugbotContextReadPorts } from '../../application/ports/bugbot_context_ports';
import type { CopilotHistoryReadPort } from '../../application/ports/copilot_history_ports';
/** Project only the existing bounded general-comment query, preserving its receiver. */
export function createCopilotHistoryReadPort(
    source: Pick<BoundBugbotContextReadPorts, 'listIssueComments'>,
    serverOrigin = 'https://github.com',
): CopilotHistoryReadPort {
    return Object.freeze({ serverOrigin, readComments: (number: number) => source.listIssueComments(number) });
}
