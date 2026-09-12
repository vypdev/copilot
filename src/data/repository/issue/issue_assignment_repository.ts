import { logDebugInfo, logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueAssignmentClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
import { toApplicationError } from '../../../application/errors/application_error';

export class IssueAssignmentRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueAssignmentClient>) {}
    getCurrentAssignees = async (owner: string, repository: string, issueNumber: number, token: string): Promise<string[]> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data: issue } = await octokit.rest.issues.get({ owner, repo: repository, issue_number: issueNumber });
            return (issue.assignees ?? []).map(assignee => assignee.login);
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to get issue assignees.'));
            throw error;
        }
    };

    assignMembersToIssue = async (
        owner: string,
        repository: string,
        issueNumber: number,
        members: string[],
        token: string,
    ): Promise<string[]> => {
        const octokit = this.githubClient.getClient(token);
        try {
            if (members.length === 0) {
                logDebugInfo('No members provided for assignment. Skipping operation.');
                return [];
            }
            const { data: updatedIssue } = await octokit.rest.issues.addAssignees({
                owner, repo: repository, issue_number: issueNumber, assignees: members,
            });
            return (updatedIssue.assignees ?? []).map(assignee => assignee.login);
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to assign issue members.'));
            throw error;
        }
    };
}
