import { prepareBugbotFindings } from '../prepare_bugbot_findings';

describe('prepareBugbotFindings', () => {
    it('filters unsafe, ignored, low-severity and duplicate findings', () => {
        const result = prepareBugbotFindings({ findings: [
            { id: 'unsafe', title: 'Unsafe', description: 'Unsafe path.', file: '../secret', severity: 'high' },
            { id: 'ignored', title: 'Ignored', description: 'Generated file.', file: 'generated.ts', severity: 'high' },
            { id: 'low', title: 'Low', description: 'Low severity.', file: 'src/a.ts', severity: 'low' },
            { id: 'same', title: 'Same', description: 'High severity.', file: 'src/a.ts', line: 2, severity: 'high' },
            { id: 'same-duplicate', title: 'Duplicate', description: 'High severity.', file: 'src/a.ts', line: 2, severity: 'high' },
        ] }, ['generated.ts'], 'medium', 10);

        expect(result?.toPublish.map((finding) => finding.id)).toEqual(['same']);
    });

    it('normalizes resolved ids and applies the publication limit', () => {
        const result = prepareBugbotFindings({
            findings: [
                { id: 'one', title: 'One', description: 'One description.', file: 'a.ts', severity: 'high' },
                { id: 'two', title: 'Two', description: 'Two description.', file: 'b.ts', severity: 'high' },
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

    it('rejects malformed findings and strips model-controlled extra properties', () => {
        const result = prepareBugbotFindings({ findings: [
            { id: 'missing-title', description: 'Description' },
            { id: 'missing-description', title: 'Title' },
            {
                id: 'valid',
                title: 'Valid',
                description: 'Description',
                line: 2.5,
                secretCommand: 'rm -rf /',
            } as never,
        ] }, [], 'low', 10);

        expect(result?.toPublish).toEqual([expect.objectContaining({
            id: 'valid',
            title: 'Valid',
            description: 'Description',
        })]);
        expect(result?.toPublish[0]).not.toHaveProperty('line');
        expect(result?.toPublish[0]).not.toHaveProperty('secretCommand');
        expect(result?.toPublish[0].fingerprint).toMatch(/^fp-[a-f0-9]{8}$/);
    });
});
