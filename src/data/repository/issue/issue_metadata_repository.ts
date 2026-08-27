import { logDebugInfo, logError } from "../../../utils/logger";
import { Milestone } from '../../model/milestone';
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubIssueMetadataClient } from "../../../application/ports/github_issue_ports";

export class IssueMetadataRepository {
    constructor(
        private readonly metadataClient: GithubClientPort<GithubIssueMetadataClient>,
        private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}

    getId = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<string> => {
        const octokit = this.graphqlClient.getClient(token);
        const query = `
          query($repo: String!, $owner: String!, $issueNumber: Int!) {
            repository(name: $repo, owner: $owner) {
              issue(number: $issueNumber) { id }
            }
          }
        `;
        const result = await octokit.graphql<{ repository: { issue: { id: string } } }>(query, {
            owner,
            repo: repository,
            issueNumber,
        });
        const issueId = result.repository.issue.id;
        logDebugInfo(`Fetched issue ID: ${issueId}`);
        return issueId;
    };

    getMilestone = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<Milestone | undefined> => {
        const octokit = this.metadataClient.getClient(token);
        const { data: issue } = await octokit.rest.issues.get({
            owner,
            repo: repository,
            issue_number: issueNumber,
        });
        return issue.milestone
            ? new Milestone(issue.milestone.id, issue.milestone.title, issue.milestone.description ?? '')
            : undefined;
    };

    getTitle = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<string | undefined> => {
        const octokit = this.metadataClient.getClient(token);
        try {
            const { data: issue } = await octokit.rest.issues.get({
                owner,
                repo: repository,
                issue_number: issueNumber,
            });
            return issue.title;
        } catch (error) {
            logError(`Failed to fetch the issue title: ${error}`);
            return undefined;
        }
    };

    isPullRequest = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<boolean> => {
        const octokit = this.metadataClient.getClient(token);
        const { data } = await octokit.rest.issues.get({
            owner,
            repo: repository,
            issue_number: issueNumber,
        });
        return !!data.pull_request;
    };

    isIssue = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<boolean> => !(await this.isPullRequest(owner, repository, issueNumber, token));

    getHeadBranch = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<string | undefined> => {
        if (!(await this.isPullRequest(owner, repository, issueNumber, token))) {
            return undefined;
        }
        const octokit = this.metadataClient.getClient(token);
        const pullRequest = await octokit.rest.pulls.get({
            owner,
            repo: repository,
            pull_number: issueNumber,
        });
        return pullRequest.data.head.ref;
    };
}
