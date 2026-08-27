import { logDebugInfo, logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueAssignmentClient } from "../../../application/ports/github_issue_ports";

export class IssueAssignmentRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueAssignmentClient>) {}
    getCurrentAssignees = async (owner: string, repository: string, issueNumber: number, token: string): Promise<string[]> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data: issue } = await octokit.rest.issues.get({ owner, repo: repository, issue_number: issueNumber });
            return (issue.assignees ?? []).map(assignee => assignee.login);
        } catch (error) {
            logError(`Error getting members of issue: ${error}.`);
            return [];
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
            logError(`Error assigning members to issue: ${error}.`);
            return [];
        }
    };
}
