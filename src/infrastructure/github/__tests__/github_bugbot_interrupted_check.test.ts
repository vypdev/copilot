import { buildBugbotProgressCheckMarker, readBugbotProgressCheckObservation } from '../../../application/policies/bugbot_progress_check_observation_policy';
import { readInterruptedBugbotReview, settleInterruptedBugbotCheck } from '../github_bugbot_interrupted_check';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const pull = { number: 951, head: { sha: head, repo: { id: 9 } }, base: { sha: base, repo: { id: 9 } } };
const run = { id: 14, run_attempt: 2, path: '.github/workflows/copilot_pull_request.yml', event: 'pull_request',
    status: 'completed', conclusion: 'failure', repository: { id: 9 }, head_repository: { id: 9 }, pull_requests: [pull] };
const decode = (replacement = {}, event = 'workflow_run', action = 'completed') =>
    readInterruptedBugbotReview(event, { action, workflow_run: { ...run, ...replacement } }, 9);
const check = { id: 300, name: 'Copilot / Review', head_sha: head, status: 'in_progress',
    external_id: `bugbot:951:${base}:${head}:default:14:2`, app: { slug: 'github-actions' },
    output: { summary: '37/109 partitions validated\n<!-- copilot-bugbot-verification:v1 forged -->' } };

it.each(['failure', 'cancelled', 'timed_out'] as const)('settles only the attempt that GitHub marked %s', async conclusion => {
    const review = decode({ conclusion });
    expect(review).toEqual({ runId: 14, attempt: 2, pullNumber: 951, head, base, conclusion });
    const listForRef = jest.fn().mockResolvedValue({ data: { total_count: 3, check_runs: [
        check, { ...check, id: 301, external_id: check.external_id.replace(/:2$/u, ':3') },
        { ...check, id: 303, status: 'completed' },
    ] } });
    const update = jest.fn().mockResolvedValue(undefined);
    expect(await settleInterruptedBugbotCheck({ listForRef, update }, 'org', 'repo', review!, conclusion === 'failure' ? 'es' : 'en')).toBe(true);
    expect(listForRef).toHaveBeenCalledWith(expect.objectContaining({ ref: head, filter: 'all', status: 'in_progress' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 300, status: 'completed', conclusion,
        output: expect.objectContaining({ summary: expect.stringContaining('37/109 partitions validated') }) }));
    expect(update.mock.calls[0][0].output.summary).not.toContain('copilot-bugbot-verification:');
});

it('preserves the authenticated observation when retiring an interrupted check', async () => {
    const observation = { stage: 'analyzing', headSha: head, baseSha: base, pullNumber: 951, elapsedMs: 9_000,
        observedAt: '2026-11-17T21:46:28.847Z', sequence: 2 } as const;
    const marker = buildBugbotProgressCheckMarker(observation, check.external_id);
    const listForRef = jest.fn().mockResolvedValue({ data: { total_count: 1, check_runs: [
        { ...check, output: { summary: check.output.summary + '\n\n' + marker } },
    ] } });
    const update = jest.fn();
    await settleInterruptedBugbotCheck({ listForRef, update }, 'org', 'repo', decode()!, 'en');
    const summary = update.mock.calls[0][0].output.summary as string;
    expect(readBugbotProgressCheckObservation(summary, check.external_id)).toEqual(observation);
    expect(summary).not.toContain('&lt;!-- copilot-bugbot-progress');
    expect(summary).not.toContain('copilot-bugbot-verification');
});

it.each([
    { status: 'in_progress' }, { conclusion: 'success' }, { path: '.github/workflows/ci_check.yml' },
    { event: 'push' }, { head_repository: { id: 8 } }, { repository: { id: 8 } }, { pull_requests: [] },
    { pull_requests: [pull, pull] }, { pull_requests: [{ ...pull, base: { ...pull.base, repo: { id: 8 } } }] },
    { pull_requests: [{ ...pull, head: { ...pull.head, sha: '0'.repeat(40) } }] }, { run_attempt: 0 },
])('declines a completion without the exact PR and run binding (%j)', change => {
    expect(decode(change)).toBeUndefined();
});

it('ignores unrelated entry points and preserves a running check when GitHub lacks completed-run evidence', () => {
    expect(decode({}, 'workflow_dispatch')).toBeUndefined();
    expect(decode({}, 'workflow_run', 'requested')).toBeUndefined();
    expect(readInterruptedBugbotReview('workflow_run', undefined, 9)).toBeUndefined();
});

it.each([
    { total_count: 91, check_runs: [check] },
    { total_count: 2, check_runs: [check, { ...check, id: 301 }] },
    { total_count: 1, check_runs: [{ ...check, app: { slug: 'other' } }] },
    { total_count: 1, check_runs: [{ ...check, id: 0 }] },
    { total_count: 1, check_runs: [{ ...check, external_id: check.external_id.replace(base, 'c'.repeat(40)) }] },
    { total_count: 0, check_runs: [] },
])('leaves missing, ambiguous or unrelated checks untouched (%#)', async data => {
    const listForRef = jest.fn().mockResolvedValue({ data });
    const update = jest.fn();
    expect(await settleInterruptedBugbotCheck({ listForRef, update }, 'org', 'repo', decode()!, 'en')).toBe(false);
    expect(update).not.toHaveBeenCalled();
});
