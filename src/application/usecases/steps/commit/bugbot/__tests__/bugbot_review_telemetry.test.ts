import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import type { Execution } from '../../../../../../data/model/execution';
import { Ai } from '../../../../../../data/model/ai';

describe('Bugbot review telemetry', () => {
    it('records aggregate metadata without storing prompt or response contents', async () => {
        let now = 1_000;
        const telemetry = new BugbotReviewTelemetry({
            owner: 'org', repo: 'repo', pullRequest: { number: 7 },
            ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { publicationMode: 'dry-run', effort: 'smart' }),
        } as unknown as Execution, { now: () => now, isoNow: () => '2026-01-01T00:00:00.000Z' });
        await telemetry.measure('analysis', async () => { now += 25; });
        telemetry.observeContext({
            prContext: { prHeadSha: 'a'.repeat(40), prFiles: [], pathToFirstDiffLine: {}, changes: [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 2, patch: 'secret patch' }] },
            reviewRuleSources: ['repository:.copilot/BUGBOT.md'],
        } as never, 'private prompt');
        telemetry.observeResponse({ findings: [{ title: 'private response' }] });

        const snapshot = telemetry.snapshot('dry-run');
        expect(snapshot).toEqual(expect.objectContaining({
            publicationMode: 'dry-run', configuredEffort: 'smart', changedFiles: 1, changedLines: 5,
            rulesLoaded: 1, promptCharacters: 14, stagesMs: { analysis: 25 }, outcome: 'dry-run',
        }));
        expect(JSON.stringify(snapshot)).not.toContain('private prompt');
        expect(JSON.stringify(snapshot)).not.toContain('secret patch');
        expect(JSON.stringify(snapshot)).not.toContain('private response');
    });
});
