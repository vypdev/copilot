import type { Execution } from '../../../../../data/model/execution';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { type CommitAndPushWorkflowResult } from './commit_and_push_workflow';
export type BugbotAutofixCommitResult = CommitAndPushWorkflowResult;
export declare function runBugbotAutofixCommitAndPush(execution: Execution, options: {
    branchOverride?: string;
    targetFindingIds?: string[];
    workspacePaths?: string[];
} | undefined, authenticatedUserPort: AuthenticatedUserPort, gitCommitPort: GitCommitPort): Promise<BugbotAutofixCommitResult>;
export declare function runUserRequestCommitAndPush(execution: Execution, options: {
    branchOverride?: string;
} | undefined, authenticatedUserPort: AuthenticatedUserPort, gitCommitPort: GitCommitPort): Promise<BugbotAutofixCommitResult>;
