import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { logDebugInfo, logError } from '../../../utils/logger';

export async function updateIssueTitle(
    client: GithubClientPort<GithubIssueTitleClient>,
    owner: string,
    repository: string,
    currentTitle: string,
    nextTitle: string,
    issueNumber: number,
    token: string,
): Promise<string | undefined> {
    if (nextTitle === currentTitle) return undefined;
    await client.getClient(token).rest.issues.update({ owner, repo: repository, issue_number: issueNumber, title: nextTitle });
    logDebugInfo(`Issue title updated to: ${nextTitle}`);
    return nextTitle;
}

export async function withTitleUpdateLogging(update: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
        return await update();
    } catch (error) {
        logError(`Failed to check or update issue title: ${error}`);
        throw error;
    }
}
