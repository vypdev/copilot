import { Result } from '../../../data/model/result';
import {
    buildStaleSourcePublicationPayload,
    hasStaleSourcePublicationOutcome,
} from '../publication_outcome_policy';

describe('publication outcome policy', () => {
    it('builds immutable stale-source evidence', () => {
        const payload = buildStaleSourcePublicationPayload('feature/work', 'a'.repeat(40));

        expect(payload).toEqual({
            publicationOutcome: {
                reason: 'stale-source', branch: 'feature/work', sourceHeadSha: 'a'.repeat(40),
            },
        });
        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload.publicationOutcome)).toBe(true);
    });

    it('recognizes only a structured stale-source outcome', () => {
        expect(hasStaleSourcePublicationOutcome([
            new Result({ id: 'stale', success: true, executed: false, payload: buildStaleSourcePublicationPayload('feature/work', 'a'.repeat(40)) }),
        ])).toBe(true);
        expect(hasStaleSourcePublicationOutcome([
            new Result({ id: 'other', success: true, executed: false, payload: { publicationOutcome: null } }),
            new Result({ id: 'malformed', success: true, executed: false, payload: { publicationOutcome: 'stale-source' } }),
            new Result({ id: 'current', success: true, executed: true, payload: { publicationOutcome: { reason: 'current' } } }),
        ])).toBe(false);
    });
});
