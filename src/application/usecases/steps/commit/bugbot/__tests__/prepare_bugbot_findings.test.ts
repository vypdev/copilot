import { prepareBugbotFindings } from '../prepare_bugbot_findings';

describe('prepareBugbotFindings', () => {
    it('filters unsafe, ignored, low-severity and duplicate findings', () => {
        const result = prepareBugbotFindings({ findings: [
            { id: 'unsafe', file: '../secret', severity: 'high' },
            { id: 'ignored', file: 'generated.ts', severity: 'high' },
            { id: 'low', file: 'src/a.ts', severity: 'low' },
            { id: 'same', file: 'src/a.ts', line: 2, severity: 'high' },
            { id: 'same-duplicate', file: 'src/a.ts', line: 2, severity: 'high' },
        ] }, ['generated.ts'], 'medium', 10);

        expect(result?.toPublish.map((finding) => finding.id)).toEqual(['same']);
    });

    it('normalizes resolved ids and applies the publication limit', () => {
        const result = prepareBugbotFindings({
            findings: [
                { id: 'one', file: 'a.ts', severity: 'high' },
                { id: 'two', file: 'b.ts', severity: 'high' },
            ],
            resolved_finding_ids: ['safe-id', '<!--broken-->'],
        }, [], 'low', 1);

        expect(result?.toPublish).toHaveLength(1);
        expect(result?.overflowCount).toBe(1);
        expect(result?.resolvedFindingIds).toEqual(new Set(['safe-id']));
    });

    it('returns undefined for non-object responses', () => {
        expect(prepareBugbotFindings('not-json', [], 'low', 10)).toBeUndefined();
    });

    it('rejects marker-colliding and overlong ids before publication', () => {
        const result = prepareBugbotFindings({
            findings: [
                { id: 'id-->x', title: 'canonical', description: 'safe' },
                { id: 'a'.repeat(201), title: 'too long', description: 'rejected' },
            ],
            resolved_finding_ids: ['resolved-->id', 'b'.repeat(201)],
        }, [], 'low', 10);

        expect(result?.toPublish.map((finding) => finding.id)).toEqual([]);
        expect(result?.resolvedFindingIds).toEqual(new Set());
    });
});
