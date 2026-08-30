import { Result } from '../../../../data/model/result';
import type { AgentConfiguration } from '../../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueCommentUpdatePort } from '../../../ports/issue_lifecycle_ports';
export { TRANSLATED_COMMENT_MARKER } from '../../../policies/comment_translation_policy';
export type CommentLanguageContext = {
    taskId: string;
    commentBody: string;
    locale: string;
    issueNumber: number;
    commentId: number;
    owner: string;
    repo: string;
    token: string;
    configuration: AgentConfiguration | undefined;
};
export declare class CommentLanguageTranslationWorkflow {
    private readonly commentRepository;
    private readonly findingsQueryPort;
    constructor(commentRepository: IssueCommentUpdatePort, findingsQueryPort: FindingsQueryPort);
    invoke(context: CommentLanguageContext): Promise<Result[]>;
    private stringProperty;
}
