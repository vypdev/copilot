import { buildBugbotStatusCountMarker, readBugbotStatusCounts } from '../bugbot_status_count_marker_policy';
import { buildBugbotStatusMarker } from '../bugbot_review_presentation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';

const head = 'a'.repeat(40);
const projection = buildBugbotReviewProjection({ pullRequestNumber: 11, analyzedHeadSha: head,
    findings: [{ id: 'fixed', state: 'fixed' }, { id: 'dismissed', state: 'dismissed' }],
    coverage: { status: 'complete', sources: [] } });
const body = `${buildBugbotStatusMarker(projection)}\n${buildBugbotStatusCountMarker(projection)}`;

describe('canonical Bugbot status count marker', () => {
    it('round-trips every state and correlates the canonical card digest', () => {
        expect(readBugbotStatusCounts(body, 11, head)).toEqual(projection.counts);
    });
    it.each([
        ['wrong PR', body, 12, head],
        ['stale head', body, 11, 'b'.repeat(40)],
        ['duplicate marker', `${body}\n${buildBugbotStatusCountMarker(projection)}`, 11, head],
        ['incomplete review', body.replace('outcome="complete"', 'outcome="partial"'), 11, head],
        ['unknown schema key', body.replace('unknown="0" -->', 'unknown="0" extra="1" -->'), 11, head],
        ['unsafe count', body.replace('open="0"', 'open="9007199254740992"'), 11, head],
        ['aggregate overflow', body.replace('open="0"', 'open="9007199254740991"'), 11, head],
        ['uncorrelated card', body.replace('copilot-bugbot-status schema', 'foreign-status schema'), 11, head],
        ['oversized marker', body.replace('schema="1" pr="11" head=', `schema="1" ${'x'.repeat(1100)} pr="11" head=`), 11, head],
    ])('rejects %s without manufacturing zero counts', (_name, candidate, number, sha) => {
        expect(readBugbotStatusCounts(String(candidate), Number(number), String(sha))).toBeUndefined();
        if (_name === 'oversized marker') {
            expect(readBugbotStatusCounts(`${body}\n${candidate}`, 11, head)).toBeUndefined();
            expect(readBugbotStatusCounts('', 11, head)).toBeUndefined();
        }
    });
});
