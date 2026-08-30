import { getCommentWatermark } from "../../../utils/comment_watermark";
import { logDebugInfo, logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueContentClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";

export interface IssueComment {
    id: number;
    body: string | null;
    user?: { login?: string };
}

export class IssueContentRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueContentClient>) {}
    updateDescription = async (
        owner: string,
        repo: string,
        issueNumber: number,
        description: string,
        token: string,
    ): Promise<void> => {
        const octokit = this.githubClient.getClient(token);
        try {
            await octokit.rest.issues.update({
                owner,
                repo,
                issue_number: issueNumber,
                body: description,
            });
        } catch (error) {
            logError(`Error updating issue description: ${error}`);
            throw error;
        }
    };

    getDescription = async (
        owner: string,
        repo: string,
        issueNumber: number,
        token: string,
    ): Promise<string | undefined> => {
        if (issueNumber === -1) {
            return undefined;
        }
        const octokit = this.githubClient.getClient(token);
        try {
            const { data: issue } = await octokit.rest.issues.get({
                owner,
                repo,
                issue_number: issueNumber,
            });
            return issue.body ?? '';
        } catch (error) {
            logError(`Error reading issue #${issueNumber} description: ${error}`);
            throw error;
        }
    };

    getIssueDescription = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<string> => {
        const octokit = this.githubClient.getClient(token);
        const { data: issue } = await octokit.rest.issues.get({
            owner,
            repo: repository,
            issue_number: issueNumber,
        });
        return issue.body ?? '';
    };

    addComment = async (
        owner: string,
        repository: string,
        issueNumber: number,
        comment: string,
        token: string,
        options?: { commitSha?: string },
    ): Promise<void> => {
        const watermark = getCommentWatermark(
            options?.commitSha ? { commitSha: options.commitSha, owner, repo: repository } : undefined,
        );
        const octokit = this.githubClient.getClient(token);
        await octokit.rest.issues.createComment({
            owner,
            repo: repository,
            issue_number: issueNumber,
            body: `${comment}\n\n${watermark}`,
        });
        logDebugInfo(`Comment added to Issue ${issueNumber}.`);
    };

    updateComment = async (
        owner: string,
        repository: string,
        issueNumber: number,
        commentId: number,
        comment: string,
        token: string,
        options?: { commitSha?: string },
    ): Promise<void> => {
        const watermark = getCommentWatermark(
            options?.commitSha ? { commitSha: options.commitSha, owner, repo: repository } : undefined,
        );
        const octokit = this.githubClient.getClient(token);
        await octokit.rest.issues.updateComment({
            owner,
            repo: repository,
            comment_id: commentId,
            body: `${comment}\n\n${watermark}`,
        });
        logDebugInfo(`Comment ${commentId} updated in Issue ${issueNumber}.`);
    };

    listIssueComments = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<IssueComment[]> => {
        const octokit = this.githubClient.getClient(token);
        const all: IssueComment[] = [];
        for await (const response of octokit.paginate.iterator(octokit.rest.issues.listComments, {
            owner,
            repo: repository,
            issue_number: issueNumber,
            per_page: 100,
        })) {
            const page = requireArrayPage<IssueComment>(response.data, 'issue comments');
            for (const comment of page) {
                all.push({
                    id: comment.id,
                    body: comment.body ?? null,
                    user: comment.user as { login?: string } | undefined,
                });
            }
        }
        return all;
    };
}
