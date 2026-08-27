/**
 * Unit tests for deduplicateFindings: dedupe by (file, line) or by title when no location.
 */

import { deduplicateFindings } from '../deduplicate_findings';
import type { BugbotFinding } from '../types';

function finding(overrides: Partial<BugbotFinding> = {}): BugbotFinding {
    return {
        id: 'id-1',
        title: 'Title',
        description: 'Desc',
        ...overrides,
    };
}

describe('deduplicateFindings', () => {
    it('returns empty array when input is empty', () => {
        expect(deduplicateFindings([])).toEqual([]);
    });

    it('returns same array when no duplicates', () => {
        const list = [
            finding({ id: 'a', file: 'a.ts', line: 1 }),
            finding({ id: 'b', file: 'b.ts', line: 2 }),
        ];
        expect(deduplicateFindings(list)).toEqual(list);
    });

    it('deduplicates by file:line (keeps first)', () => {
        const list = [
            finding({ id: 'first', title: 'First', file: 'src/foo.ts', line: 10 }),
            finding({ id: 'second', title: 'Second', file: 'src/foo.ts', line: 10 }),
        ];
        const result = deduplicateFindings(list);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('first');
        expect(result[0].title).toBe('First');
    });

    it('deduplicates by normalized title when file/line missing (keeps first)', () => {
        const list = [
            finding({ id: 'x', title: 'Same Title', description: 'A' }),
            finding({ id: 'y', title: 'Same Title', description: 'B' }),
        ];
        const result = deduplicateFindings(list);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('x');
    });

    it('uses title key when file is empty and line is 0', () => {
        const list = [
            finding({ id: 'a', title: 'Duplicate', file: '', line: 0 }),
            finding({ id: 'b', title: 'Duplicate', file: undefined, line: undefined }),
        ];
        const result = deduplicateFindings(list);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a');
    });

    it('uses first 80 chars of title for title-based key', () => {
        const longTitle = 'A'.repeat(100);
        const list = [
            finding({ id: '1', title: longTitle }),
            finding({ id: '2', title: longTitle + ' different tail' }),
        ];
        const result = deduplicateFindings(list);
        expect(result).toHaveLength(1);
    });

    it('trims file and uses line 0 when line undefined', () => {
        const list = [
            finding({ id: 'a', file: '  p.ts  ', line: undefined }),
            finding({ id: 'b', file: 'p.ts', line: 0 }),
        ];
        const result = deduplicateFindings(list);
        expect(result).toHaveLength(1);
    });

    it('different file or line keeps both', () => {
        const list = [
            finding({ id: '1', file: 'a.ts', line: 1 }),
            finding({ id: '2', title: 'Other', file: 'a.ts', line: 2 }),
            finding({ id: '3', title: 'Other', file: 'b.ts', line: 1 }),
        ];
        expect(deduplicateFindings(list)).toHaveLength(3);
    });
});
