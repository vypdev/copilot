import type { BugbotGitMutationPort } from '../../../../../application/ports/bugbot_git_ports';
import { buildBugbotCommitMessage, buildUserRequestCommitMessage } from './commit_message_policy';
import {
    runCommitAndPushWorkflow,
    type CommitAndPushWorkflowResult,
} from './commit_and_push_workflow';
import type { BugbotCommitContext } from './bugbot_review_operation_context';

export type BugbotAutofixCommitResult = CommitAndPushWorkflowResult;

export async function runBugbotAutofixCommitAndPush(
    context: BugbotCommitContext,
    options: { branchOverride?: string; branchAlreadyCheckedOut?: boolean; targetFindingIds?: string[]; workspacePaths?: string[] } | undefined,
    gitCommitPort: BugbotGitMutationPort,
): Promise<BugbotAutofixCommitResult> {
    const branch = options?.branchOverride ?? context.branch;
    return runCommitAndPushWorkflow(context, {
        branch,
        branchOverride: Boolean(options?.branchOverride) && !options?.branchAlreadyCheckedOut,
        workspacePaths: options?.workspacePaths,
        commitMessage: buildBugbotCommitMessage(context.issueNumber, options?.targetFindingIds ?? []),
        noChangesMessage: 'No changes to commit after autofix.',
    }, gitCommitPort);
}

export async function runUserRequestCommitAndPush(
    context: BugbotCommitContext,
    options: { branchOverride?: string; branchAlreadyCheckedOut?: boolean; workspacePaths?: string[] } | undefined,
    gitCommitPort: BugbotGitMutationPort,
): Promise<BugbotAutofixCommitResult> {
    const branch = options?.branchOverride ?? context.branch;
    return runCommitAndPushWorkflow(context, {
        branch,
        branchOverride: Boolean(options?.branchOverride) && !options?.branchAlreadyCheckedOut,
        workspacePaths: options?.workspacePaths,
        commitMessage: buildUserRequestCommitMessage(context.issueNumber),
        noChangesMessage: 'No changes to commit after user request.',
    }, gitCommitPort);
}
