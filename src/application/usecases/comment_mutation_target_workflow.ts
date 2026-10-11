import type { CommentAutomationContext } from './comment_automation_context';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import { ApplicationError } from '../errors/application_error';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { selectCanonicalBugbotPullRequest } from '../../domain/bugbot/context';
import { projectBugbotContextRequest } from './steps/commit/bugbot/bugbot_context_request';

export async function resolveCommentMutationBranch(param: CommentAutomationContext, options: CommentAutomationOptions): Promise<string> {
    const operation = param.bugbot.fixIntent;
    if (!operation.target.isPullRequest) {
        const branch = (param.status.branch || operation.target.headBranch).trim();
        if (!branch) return '';
        if (!options.rememberBranchPorts) throw new ApplicationError('configuration.unsupported', 'Canonical branch reads are unavailable for file-changing commands.');
        const linked = await options.rememberBranchPorts.linkedBranches.getLinkedBranch(operation.target.issueNumber, branch);
        if (linked?.name !== branch || !canonicalGitObjectId(linked.headSha)) {
            throw new ApplicationError('workflow.stale', 'File-changing commands require a verified issue-linked branch.');
        }
        return branch;
    }
    const request = projectBugbotContextRequest(operation);
    const selection = request.target.pullRequestSelection;
    if (selection.kind !== 'event' || selection.number === undefined) {
        throw new ApplicationError('workflow.invalid-event', 'File-changing commands require the exact pull-request conversation identity.');
    }
    if (!options.rememberBranchPorts) {
        throw new ApplicationError('configuration.unsupported', 'Canonical pull-request reads are unavailable for file-changing commands.');
    }
    const candidate = await options.rememberBranchPorts.pullRequests.getPullRequest(selection.number);
    const canonical = selectCanonicalBugbotPullRequest(request.target, [candidate], 'event');
    if (canonical.kind !== 'canonical') {
        throw new ApplicationError('workflow.stale', 'File-changing commands require a verified current pull request.');
    }
    if (canonical.pullRequest.headRepositoryOwner.toLowerCase() !== operation.repository.owner.toLowerCase()
        || canonical.pullRequest.headRepositoryName?.toLowerCase() !== operation.repository.name.toLowerCase()) {
        throw new ApplicationError('workflow.invalid-event', 'File-changing commands cannot push to a fork pull request.');
    }
    return canonical.pullRequest.headRef.trim();
}

