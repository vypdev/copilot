import type { BoundedBugbotRead } from './bugbot_context_ports';
import type { BugbotIssueComment } from './bugbot_issue_read_ports';
/** Exact-target general-conversation read only. No review-thread or mutation authority. */
export interface CopilotHistoryReadPort {
    readonly serverOrigin: string;
    readComments(number: number): Promise<BoundedBugbotRead<readonly BugbotIssueComment[]>>;
}
export interface CopilotHistoryRequest {
    readonly owner: string;
    readonly repository: string;
    readonly target: { readonly kind: 'issue' | 'pr'; readonly number: number };
    readonly queryId: number;
    readonly botLogin: string;
    readonly locale: string;
    readonly generalConversation: boolean;
}
