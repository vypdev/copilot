import type { Execution } from '../../../../../data/model/execution';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { buildBugbotCommitMessage, buildUserRequestCommitMessage } from './commit_message_policy';
import {
    runCommitAndPushWorkflow,
    type CommitAndPushWorkflowResult,
} from './commit_and_push_workflow';

export type BugbotAutofixCommitResult = CommitAndPushWorkflowResult;

export async function runBugbotAutofixCommitAndPush(
    execution: Execution,
    options: { branchOverride?: string; targetFindingIds?: string[]; workspacePaths?: string[] } | undefined,
    authenticatedUserPort: AuthenticatedUserPort,
    gitCommitPort: GitCommitPort,
): Promise<BugbotAutofixCommitResult> {
    const branch = options?.branchOverride ?? execution.commit.branch;
    return runCommitAndPushWorkflow(execution, {
        branch,
        branchOverride: Boolean(options?.branchOverride),
        workspacePaths: options?.workspacePaths,
        commitMessage: buildBugbotCommitMessage(execution.issueNumber, options?.targetFindingIds ?? []),
        noChangesMessage: 'No changes to commit after autofix.',
    }, authenticatedUserPort, gitCommitPort);
}

export async function runUserRequestCommitAndPush(
    execution: Execution,
    options: { branchOverride?: string } | undefined,
    authenticatedUserPort: AuthenticatedUserPort,
    gitCommitPort: GitCommitPort,
): Promise<BugbotAutofixCommitResult> {
    const branch = options?.branchOverride ?? execution.commit.branch;
    return runCommitAndPushWorkflow(execution, {
        branch,
        branchOverride: Boolean(options?.branchOverride),
        commitMessage: buildUserRequestCommitMessage(execution.issueNumber),
        noChangesMessage: 'No changes to commit after user request.',
    }, authenticatedUserPort, gitCommitPort);
}
