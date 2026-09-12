import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContextPorts } from '../../../../ports/bugbot_context_ports';
import type { BugbotContext } from './types';

export function expectedBugbotHeadSha(execution: Execution): string | undefined {
    // Comment-triggered reviews intentionally target the latest remote head:
    // their payload SHA may predate an autofix committed in the same run.
    const eventName = execution.eventName;
    const candidate = eventName === 'pull_request'
        ? execution.inputs?.pull_request?.head?.sha
        : eventName === 'workflow_run'
            ? execution.inputs?.workflow_run?.head_sha
            : eventName === 'check_suite'
                ? execution.inputs?.check_suite?.head_sha
                : undefined;
    return typeof candidate === 'string' && /^[0-9a-f]{7,64}$/iu.test(candidate.trim())
        ? candidate.trim().toLowerCase()
        : undefined;
}

export function isLoadedBugbotRevisionSuperseded(context: BugbotContext, expectedHeadSha: string | undefined): boolean {
    return expectedHeadSha !== undefined && context.prContext !== null
        && context.prContext.prHeadSha.toLowerCase() !== expectedHeadSha;
}

/** Re-reads the remote head immediately before publication to close the analysis race window. */
export async function hasNewerBugbotRevision(
    execution: Execution,
    context: BugbotContext,
    ports: BugbotContextPorts,
): Promise<boolean> {
    if (!context.prContext || !context.canonicalPullRequest) return false;
    const reader = ports.loader.bind({
        owner: execution.owner,
        repository: execution.repo,
        token: execution.tokens.token,
    });
    const currentHead = await reader.getPullRequestHeadSha(context.canonicalPullRequest.number);
    return currentHead !== undefined && currentHead.toLowerCase() !== context.prContext.prHeadSha.toLowerCase();
}
