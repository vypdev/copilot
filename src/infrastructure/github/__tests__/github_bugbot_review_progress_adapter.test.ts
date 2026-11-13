import { githubBugbotReviewProgress } from '../github_bugbot_review_progress_adapter';
import type { BugbotReviewProgressObservation } from '../../../application/ports/bugbot_review_progress_ports';

const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const runUrl = 'https://github.com/vypdev/copilot/actions/runs/14/attempts/2';
const observation: BugbotReviewProgressObservation = {
    stage: 'analyzing', headSha, baseSha, pullNumber: 951, elapsedMs: 8_000, observedAt: '2026-11-13T00:00:00.000Z', sequence: 1,
    partitions: { completed: 3, total: 105 }, frames: { ordinal: 1, total: 2 },
};
function fixture() {
    const publish = jest.fn().mockResolvedValue(undefined);
    const current = jest.fn().mockResolvedValue({ headSha, baseSha, baseRefSha: baseSha, state: 'open' });
    const check = jest.fn().mockResolvedValue(undefined);
    const port = githubBugbotReviewProgress({ runId: 14, attempt: 2, runUrl,
        pullNumber: 951, expectedHead: headSha, expectedBase: baseSha, policy: 'c'.repeat(64) }, { publish }, current, check);
    return { port, publish, current, check };
}

it('publishes a content-free progress observation with comparison, attempt, and policy binding', async () => {
    const { port, check, current } = fixture();
    await port.observe(observation, false, 'es-ES');
    expect(current).toHaveBeenCalledWith(951);
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ headSha, runUrl, title: 'Analizando el diff',
        summary: expect.stringContaining('3/105 particiones validadas'),
        externalId: `bugbot:951:${baseSha}:${headSha}:${'c'.repeat(64)}:14:2` }));
});

it.each([
    { headSha: 'c'.repeat(40) },
    { baseSha: 'c'.repeat(40) },
    { baseRefSha: 'c'.repeat(40) },
    { state: 'closed' },
])('does not write a stale review observation (%j)', async replacement => {
    const { port, check, current } = fixture();
    current.mockResolvedValue({ headSha, baseSha, baseRefSha: baseSha, state: 'open', ...replacement });
    await port.observe(observation, false, 'en');
    expect(check).not.toHaveBeenCalled();
});

it('keeps dry-run progress in the Job Summary without provider calls', async () => {
    const { port, check, publish, current } = fixture();
    await port.observe(observation, true, 'en');
    await port.observe({ ...observation, sequence: 2, stage: 'finished', outcome: 'dry-run' }, true, 'en');
    expect(check).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(expect.stringContaining('Dry-run completed'));
});

it('ignores delayed or duplicate updates within the same attempt', async () => {
    const { port, check } = fixture();
    await port.observe({ ...observation, sequence: 4 }, false, 'en');
    await port.observe(observation, false, 'en');
    await port.observe({ ...observation, sequence: 4 }, false, 'en');
    expect(check).toHaveBeenCalledTimes(1);
});
