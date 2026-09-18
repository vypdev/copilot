import { githubUsersMatch } from '../../domain/github_user_policy';

/** A PAT-authored PR may receive Bugbot analysis, but no lifecycle mutation. */
export function isBotPullRequestAnalysisEvent(input: {
    readonly eventName: string;
    readonly action: unknown;
    readonly actor: string;
    readonly tokenUser: string;
    readonly repositoryId: unknown;
    readonly pullRequest: unknown;
}): boolean {
    if (input.eventName !== 'pull_request'
        || !['opened', 'reopened', 'synchronize'].includes(String(input.action))
        || !githubUsersMatch(input.actor, input.tokenUser)
        || !Number.isSafeInteger(input.repositoryId)) return false;
    const pull = record(input.pullRequest);
    const head = record(pull?.head);
    const headRepo = record(head?.repo);
    const author = record(pull?.user);
    return pull?.state === 'open'
        && Number.isSafeInteger(pull?.number)
        && Number(pull?.number) > 0
        && headRepo?.id === input.repositoryId
        && githubUsersMatch(String(author?.login ?? ''), input.tokenUser);
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}
