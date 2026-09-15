import { Result } from '../../../data/model/result';
import {
    buildDuplicateCompactionPublicationPayload,
    buildStaleSourcePublicationPayload,
    duplicateCompactionPublicationOutcomes,
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

    it('builds sorted, unique, bounded duplicate-compaction evidence', () => {
        const payload = buildDuplicateCompactionPublicationPayload([
            9, 3, 9, -1, 0, ...Array.from({ length: 25 }, (_, index) => index + 10),
        ]);

        expect(payload?.publicationCleanup).toMatchObject({
            reason: 'duplicate-deletion-forbidden',
            compactedCount: 27,
            compactedCommentIds: [3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
        });
        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload?.publicationCleanup)).toBe(true);
        expect(Object.isFrozen(payload?.publicationCleanup.compactedCommentIds)).toBe(true);
        expect(buildDuplicateCompactionPublicationPayload([0, -1, Number.NaN])).toBeUndefined();
    });

    it('projects only valid duplicate-compaction evidence', () => {
        const valid = buildDuplicateCompactionPublicationPayload([12, 15]);
        const projected = duplicateCompactionPublicationOutcomes([
            new Result({ id: 'cleanup', success: true, executed: true, payload: valid }),
            new Result({ id: 'string', success: true, executed: true, payload: { publicationCleanup: 'invalid' } }),
            new Result({ id: 'reason', success: true, executed: true, payload: { publicationCleanup: { reason: 'other' } } }),
            new Result({ id: 'count', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 0, compactedCommentIds: [12],
            } } }),
            new Result({ id: 'not-array', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 1, compactedCommentIds: '12',
            } } }),
            new Result({ id: 'over-count', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 1, compactedCommentIds: [12, 15],
            } } }),
            new Result({ id: 'unbounded', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 21,
                compactedCommentIds: Array.from({ length: 21 }, (_, index) => index + 1),
            } } }),
            new Result({ id: 'ids', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 1, compactedCommentIds: ['12'],
            } } }),
            new Result({ id: 'empty-ids', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 1, compactedCommentIds: [],
            } } }),
            new Result({ id: 'duplicate-ids', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 2, compactedCommentIds: [12, 12],
            } } }),
            new Result({ id: 'unordered-ids', success: true, executed: true, payload: { publicationCleanup: {
                reason: 'duplicate-deletion-forbidden', compactedCount: 2, compactedCommentIds: [15, 12],
            } } }),
        ]);

        expect(projected).toEqual([valid?.publicationCleanup]);
        expect(Object.isFrozen(projected)).toBe(true);
        expect(Object.isFrozen(projected[0])).toBe(true);
    });
});
