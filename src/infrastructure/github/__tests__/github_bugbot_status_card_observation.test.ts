import { buildBugbotProgressCheckMarker } from '../../../application/policies/bugbot_progress_check_observation_policy';
import { nativeBugbotAnalysisPath, readNativeBugbotStatusCardReview } from '../github_bugbot_status_card_observation';

const repositoryUrl = 'https://github.com/vypdev/copilot';
const runUrl = repositoryUrl + '/actions/runs/23/attempts/2';
const source = { repositoryId: 19, pullNumber: 11, base: 'a'.repeat(40), baseRef: 'b'.repeat(40),
    head: 'c'.repeat(40), policy: 'd'.repeat(64) };
const wakeup = { source, runId: 23, attempt: 2, dryRun: false };
const run = {
    id: 23, run_attempt: 2, path: nativeBugbotAnalysisPath, event: 'pull_request', status: 'in_progress',
    repository: { id: 19 }, head_repository: { id: 19 },
    pull_requests: [{ number: 11, head: { sha: source.head, repo: { id: 19 } },
        base: { sha: source.base, repo: { id: 19 } } }],
};
const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, 23, 2].join(':');
const observation = {
    stage: 'analyzing' as const, headSha: source.head, baseSha: source.base, baseRefSha: source.baseRef,
    pullNumber: source.pullNumber, elapsedMs: 5511, sequence: 3, observedAt: '2026-11-18T04:31:00.000Z',
};
const summary = buildBugbotProgressCheckMarker(observation, externalId);
const check = { id: 44, name: 'Copilot / Review', head_sha: source.head, external_id: externalId,
    details_url: runUrl, status: 'in_progress', app: { slug: 'github-actions' }, output: { summary } };

it('loads the exact current native check with the matching workflow and repository', () => {
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, run, { total_count: 1, check_runs: [check] }))
        .toEqual({ state: 'active', runId: 23, attempt: 2, runUrl, checkDetails: summary });
});

it.each([
    { app: { slug: 'other-app' } }, { details_url: runUrl + '0' }, { external_id: externalId + '0' },
    { output: { summary: buildBugbotProgressCheckMarker({ ...observation, baseRefSha: source.base }, externalId) } },
])('rejects foreign or mismatched check provenance', override => {
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, run,
        { total_count: 1, check_runs: [{ ...check, ...override }] })).toBeUndefined();
});

it('fails closed when the attempt has advanced or the list is incomplete or ambiguous', () => {
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, { ...run, run_attempt: 3 },
        { total_count: 1, check_runs: [check] })).toBeUndefined();
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, run,
        { total_count: 2, check_runs: [check] })).toBeUndefined();
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, run,
        { total_count: 2, check_runs: [check, { ...check, id: 45 }] })).toBeUndefined();
});

it('preserves a last authenticated observation from the native check details after failure', () => {
    expect(readNativeBugbotStatusCardReview(wakeup, repositoryUrl, { ...run, status: 'completed', conclusion: 'cancelled' },
        { total_count: 1, check_runs: [{ ...check, status: 'completed', output: { text: summary },
            details_url: repositoryUrl + '/runs/' + check.id }] }))
        .toEqual({ state: 'interrupted', runId: 23, attempt: 2, runUrl, checkDetails: summary });
});
