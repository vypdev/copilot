/**
 * Unit tests for applyCommentLimit: max comments and overflow titles.
 */

import { BUGBOT_MAX_COMMENTS } from '../../../../../../utils/constants';
import { applyCommentLimit } from '../limit_comments';
import type { BugbotFinding } from '../types';

function finding(id: string, title: string): BugbotFinding {
    return { id, title, description: 'D' };
}

describe('applyCommentLimit', () => {
    it('returns all findings when within limit', () => {
        const list = [finding('1', 'A'), finding('2', 'B')];
        const result = applyCommentLimit(list);
        expect(result.toPublish).toEqual(list);
        expect(result.overflowCount).toBe(0);
        expect(result.overflowTitles).toEqual([]);
    });

    it('returns all findings when exactly at limit', () => {
        const list = Array.from({ length: BUGBOT_MAX_COMMENTS }, (_, i) =>
            finding(`id-${i}`, `Title ${i}`)
        );
        const result = applyCommentLimit(list);
        expect(result.toPublish).toHaveLength(BUGBOT_MAX_COMMENTS);
        expect(result.overflowCount).toBe(0);
        expect(result.overflowTitles).toEqual([]);
    });

    it('splits when over limit: toPublish first N, overflow rest', () => {
        const limit = 5;
        const list = Array.from({ length: 8 }, (_, i) => finding(`id-${i}`, `Title ${i}`));
        const result = applyCommentLimit(list, limit);
        expect(result.toPublish).toHaveLength(limit);
        expect(result.toPublish.map((f) => f.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4']);
        expect(result.overflowCount).toBe(3);
        expect(result.overflowTitles).toEqual(['Title 5', 'Title 6', 'Title 7']);
    });

    it('uses custom maxComments when provided', () => {
        const list = [finding('1', 'A'), finding('2', 'B'), finding('3', 'C')];
        const result = applyCommentLimit(list, 2);
        expect(result.toPublish).toHaveLength(2);
        expect(result.overflowCount).toBe(1);
        expect(result.overflowTitles).toEqual(['C']);
    });

    it('overflowTitles uses id when title is missing or empty', () => {
        const list = [
            finding('id-with-title', 'Has Title'),
            { id: 'id-no-title', title: '', description: 'x' } as BugbotFinding,
        ];
        const result = applyCommentLimit(list, 1);
        expect(result.overflowTitles).toContain('id-no-title');
    });

    it('trims title in overflowTitles', () => {
        const list = [
            finding('1', '  Trimmed  '),
        ];
        const result = applyCommentLimit(list, 0);
        expect(result.overflowTitles).toEqual(['Trimmed']);
    });
});
