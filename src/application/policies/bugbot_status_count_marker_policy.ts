import type { BugbotReviewProjection } from '../../domain/bugbot/review_projection';
import { BUGBOT_FINDING_STATES, type BugbotFindingStateCounts } from '../../domain/bugbot/review_state';

export const BUGBOT_STATUS_COUNTS_PREFIX = 'copilot-bugbot-state-counts';

/** Read-only status evidence; this marker never authorizes approval or mutation. */
export function buildBugbotStatusCountMarker(projection: BugbotReviewProjection): string {
    const c = projection.counts;
    return `<!-- ${BUGBOT_STATUS_COUNTS_PREFIX} schema="1" pr="${projection.pullRequestNumber}" head="${projection.verifiedHeadSha}" digest="${projection.digest}" outcome="${projection.outcome}" coverage="${projection.coverage.status}" open="${c.open}" reopened="${c.reopened}" fixed="${c.fixed}" obsolete="${c.obsolete}" dismissed="${c.dismissed}" verification="${c['verification-required']}" unknown="${c.unknown}" -->`;
}

/** Requires one complete, closed-shape marker correlated with its canonical card. */
export function readBugbotStatusCounts(body: string, number: number, head: string): Readonly<BugbotFindingStateCounts> | undefined {
    if ((body.match(/<!--\s*copilot-bugbot-state-counts\b/gu) ?? []).length !== 1) return undefined;
    const markers = body.match(/<!--\s*copilot-bugbot-state-counts\b[\s\S]{0,1000}?-->/gu) ?? [];
    if (markers.length !== 1) return undefined;
    const match = /^<!-- copilot-bugbot-state-counts schema="1" pr="([1-9]\d{0,15})" head="([a-f0-9]{40}|[a-f0-9]{64})" digest="([a-f0-9]{8})" outcome="complete" coverage="complete" open="(\d{1,16})" reopened="(\d{1,16})" fixed="(\d{1,16})" obsolete="(\d{1,16})" dismissed="(\d{1,16})" verification="(\d{1,16})" unknown="(\d{1,16})" -->$/u.exec(markers[0]);
    if (!match || Number(match[1]) !== number || match[2] !== head) return undefined;
    if (!body.includes(`<!-- copilot-bugbot-status schema="1" pr="${number}" verified_head="${head}" digest="${match[3]}" -->`)) return undefined;
    const values = match.slice(4).map(Number);
    if (values.some(value => !Number.isSafeInteger(value))
        || !Number.isSafeInteger(values.reduce((sum, value) => sum + value, 0))) return undefined;
    return Object.freeze(Object.fromEntries(BUGBOT_FINDING_STATES.map((state, index) => [state, values[index]])) as BugbotFindingStateCounts);
}
