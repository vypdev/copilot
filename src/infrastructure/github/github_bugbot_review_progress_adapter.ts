import type { BugbotReviewProgressPort } from '../../application/ports/bugbot_review_progress_ports';
import type { CopilotLiveReviewCheck } from '../../application/ports/copilot_evidence_ports';
import type { ActionSummaryPort } from '../../application/ports/action_summary_ports';
import { renderBugbotLiveProgress } from '../../application/policies/bugbot_live_progress_presentation_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';

interface NativeReviewProgressContext {
    readonly runId: number;
    readonly attempt: number;
    readonly runUrl: string;
    readonly pullNumber?: number;
    readonly expectedHead?: string;
    readonly expectedBase?: string;
    readonly policy?: string;
}

/** Reports native progress on the one check owned by this invocation. */
export function githubBugbotReviewProgress(
    context: NativeReviewProgressContext,
    summary: ActionSummaryPort,
    current: (number: number) => Promise<{ headSha?: string; baseSha?: string; baseRefSha?: string; state?: string } | undefined>,
    observeCheck: (check: CopilotLiveReviewCheck) => Promise<void>,
): BugbotReviewProgressPort {
    let checkStarted = false;
    let sequence = 0;
    return { async observe(observation, dryRun, locale) {
        if (!Number.isSafeInteger(observation.sequence) || observation.sequence <= sequence) return;
        sequence = observation.sequence;
        const view = renderBugbotLiveProgress(observation, locale, context.runUrl);
        if (observation.stage === 'finished') await summary.publish(view.summary + '\n\n');
        if (dryRun || observation.outcome === 'superseded' || observation.pullNumber !== context.pullNumber
            || observation.headSha !== context.expectedHead || observation.baseSha !== context.expectedBase || !observation.baseSha
            || (observation.stage === 'finished' && !checkStarted)) return;
        const live = await current(observation.pullNumber);
        if (live?.state !== 'open' || canonicalGitObjectId(live.headSha) !== observation.headSha
            || live.baseSha !== observation.baseSha || live.baseRefSha !== (observation.baseRefSha ?? observation.baseSha)) return;
        await observeCheck({ ...view, headSha: observation.headSha, runUrl: context.runUrl,
            externalId: `bugbot:${observation.pullNumber}:${observation.baseSha}:${observation.headSha}:${context.policy ?? 'default'}:${context.runId}:${context.attempt}` });
        checkStarted = true;
    } };
}
