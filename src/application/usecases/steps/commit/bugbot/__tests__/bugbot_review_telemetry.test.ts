import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import type { Execution } from '../../../../../../data/model/execution';
import { Ai } from '../../../../../../data/model/ai';
import { buildBugbotReviewProjection } from '../../../../../../domain/bugbot/review_projection';

describe('Bugbot review telemetry', () => {
    it('records aggregate metadata without storing prompt or response contents', async () => {
        let now = 1_000;
        const telemetry = new BugbotReviewTelemetry({
            owner: 'org', repo: 'repo', pullRequest: { number: 7 },
            eventName: 'pull_request', inputs: { repository: { id: 99 } },
            ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { publicationMode: 'dry-run', effort: 'smart' }),
        } as unknown as Execution, { now: () => now, isoNow: () => '2026-01-01T00:00:00.000Z' });
        await telemetry.measure('analysis', async () => { now += 25; });
        telemetry.observeContext({
            canonicalPullRequest: {
                number: 9,
                state: 'open',
                baseRepository: { owner: 'org', name: 'repo' },
                headRepositoryOwner: 'org',
                headRef: 'feature',
                headSha: 'a'.repeat(40),
            },
            selectionReason: 'exact-head',
            coverage: {
                status: 'partial',
                sources: [
                    { source: 'selection', status: 'complete', pagesFetched: 1, itemsFetched: 1, itemsRetained: 1, omittedItems: 0, truncatedItems: 0, limitReached: false },
                    { source: 'issue-comments', status: 'partial', pagesFetched: 2, itemsFetched: 200, itemsRetained: 200, omittedItems: 1, truncatedItems: 0, limitReached: true },
                    { source: 'human-conversation', status: 'partial', pagesFetched: 0, itemsFetched: 60, itemsRetained: 50, omittedItems: 10, truncatedItems: 0, limitReached: true },
                    { source: 'rules', status: 'complete', pagesFetched: 1, itemsFetched: 1, itemsRetained: 1, omittedItems: 0, truncatedItems: 0, limitReached: false },
                ],
            },
            prContext: { prHeadSha: 'a'.repeat(40), prFiles: [], pathToFirstDiffLine: {}, changes: [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 2, patch: 'secret patch' }] },
            reviewRuleSources: ['repository:.copilot/BUGBOT.md'],
        } as never, 'private prompt');
        telemetry.observeResponse({ findings: [{ title: 'private response' }] });

        const snapshot = telemetry.snapshot('dry-run');
        expect(snapshot).toEqual(expect.objectContaining({
            publicationMode: 'dry-run', configuredEffort: 'smart', changedFiles: 1, changedLines: 5,
            rulesLoaded: 1, promptCharacters: 14, stagesMs: { analysis: 25 }, outcome: 'dry-run',
            repositoryId: 99, triggerKind: 'pull_request',
            pullRequestNumber: 9, contextSelectionReason: 'exact-head', contextCoverageStatus: 'partial',
            contextCandidateBucket: '1',
            contextLogicalProviderReads: 2, contextRawProviderRequests: 3, contextConcurrencyLimit: 2,
        }));
        expect(snapshot.contextCoverage).toEqual(expect.objectContaining({
            'issue-comments': expect.objectContaining({ omittedItems: 1, limitReached: true }),
        }));
        expect(snapshot.contextCoverage).toHaveProperty('human-conversation');
        expect(JSON.stringify(snapshot)).not.toContain('private prompt');
        expect(JSON.stringify(snapshot)).not.toContain('secret patch');
        expect(JSON.stringify(snapshot)).not.toContain('private response');
    });

    it('uses the final provider-verified projection instead of intended mutation state', () => {
        const telemetry = new BugbotReviewTelemetry({
            owner: 'org', repo: 'repo', pullRequest: { number: 7 },
            ai: new Ai('', 'model', false, [], false, 'low', 20),
        } as unknown as Execution);
        telemetry.observeContext({
            existingByFindingId: {},
            canonicalPullRequest: null,
            selectionReason: 'none',
            coverage: { status: 'complete', sources: [] },
            prContext: { prHeadSha: 'a'.repeat(40), prFiles: [], pathToFirstDiffLine: {}, changes: [] },
        } as never, 'prompt');
        telemetry.observePrepared({
            activeFindings: [{ id: 'f1' }],
            toPublish: [{ id: 'f1' }],
            resolvedFindingIds: new Set(),
            resolvedFindingResolutions: new Map(),
            overflowCount: 0,
        } as never);
        telemetry.observeProjection(buildBugbotReviewProjection({
            pullRequestNumber: 7,
            analyzedHeadSha: 'a'.repeat(40),
            coverage: { status: 'complete', sources: [] },
            findings: [{ id: 'f1', state: 'unknown' }],
            errors: ['Publication is not observable.'],
        }));

        expect(telemetry.snapshot('failed').findingStates).toEqual(expect.objectContaining({
            open: 0,
            unknown: 1,
        }));
    });
});
