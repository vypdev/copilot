import { buildBugbotBenchmarkPrompt, runBugbotBenchmarkAgent } from '../bugbot_benchmark_runner';
import type { BugbotBenchmarkCase } from '../bugbot_benchmark';

const testCase: BugbotBenchmarkCase = {
    id: 'case-1', language: 'typescript', category: 'correctness', description: 'Synthetic unsafe lookup',
    file: 'src/example.ts', startLine: 40, diff: '+return user.name;', expected: [{ title: 'Hidden ground truth title' }],
};

describe('Bugbot benchmark runner', () => {
    it('does not leak ground truth into the agent prompt', () => {
        const prompt = buildBugbotBenchmarkPrompt(testCase);
        expect(prompt).toContain('src/example.ts');
        expect(prompt).toContain('[BEGIN_UNTRUSTED_DATA');
        expect(prompt).not.toContain('Hidden ground truth title');
    });

    it('runs cases sequentially and captures structured findings', async () => {
        let active = 0;
        let maximum = 0;
        const query = jest.fn().mockImplementation(async () => {
            active += 1;
            maximum = Math.max(maximum, active);
            await Promise.resolve();
            active -= 1;
            return { findings: [{ id: 'detected', title: 'Detected', description: 'A real defect.', file: 'src/example.ts', line: 40 }] };
        });
        const result = await runBugbotBenchmarkAgent(
            { schemaVersion: 1, cases: [testCase, { ...testCase, id: 'case-2' }] },
            { query },
            {} as never,
        );
        expect(maximum).toBe(1);
        expect(query).toHaveBeenCalledTimes(2);
        expect(result.predictions['case-1']).toEqual([expect.objectContaining({ title: 'Detected' })]);
    });

    it('drops malformed agent findings through the production normalization contract', async () => {
        const result = await runBugbotBenchmarkAgent(
            { schemaVersion: 1, cases: [testCase] },
            { query: jest.fn().mockResolvedValue({ findings: [
                { title: 'Missing id and description' },
                { id: 'valid', title: 'Valid', description: 'Actionable defect.' },
            ] }) },
            {} as never,
        );

        expect(result.predictions['case-1']).toEqual([expect.objectContaining({ id: 'valid' })]);
    });
});
