/**
 * Builds the prompt for OpenCode (plan agent) to decide if the user is requesting
 * to fix one or more bugbot findings and which finding ids to target.
 */
export interface UnresolvedFindingSummary {
    id: string;
    title: string;
    description?: string;
    file?: string;
    line?: number;
}
export declare function buildBugbotFixIntentPrompt(userComment: string, unresolvedFindings: UnresolvedFindingSummary[], parentCommentBody?: string): string;
