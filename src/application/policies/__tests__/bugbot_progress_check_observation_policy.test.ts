import { buildBugbotProgressCheckMarker, readBugbotProgressCheckObservation } from '../bugbot_progress_check_observation_policy';
import type { BugbotReviewProgressObservation } from '../../ports/bugbot_review_progress_ports';

const head = 'b'.repeat(40);
const base = 'a'.repeat(40);
const externalId = `bugbot:951:${base}:${head}:default:14:2`;
const observation: BugbotReviewProgressObservation = {
    stage: 'analyzing', headSha: head, baseSha: base, baseRefSha: base, pullNumber: 951, elapsedMs: 928_000,
    observedAt: '2026-11-17T21:46:28.847Z', sequence: 5, partitions: { total: 110, completed: 5 },
    frames: { total: 2, ordinal: 1 }, retries: 3, candidates: { completed: 0, total: 0 }, stageTimesMs: { preparing: 17_800 },
};
const forge = (body: unknown) => `<!-- copilot-bugbot-progress:v1 ${Buffer.from(JSON.stringify(body)).toString('base64url')} -->`;

test('projects only closed observation facts for one exact native attempt', () => {
    const marker = buildBugbotProgressCheckMarker(observation, externalId);
    expect(readBugbotProgressCheckObservation('Visible summary\n\n' + marker, externalId)).toEqual(observation);
    expect(marker).not.toContain('copilot-bugbot-verification');
    expect(readBugbotProgressCheckObservation(marker!, externalId.replace(/:2$/u, ':3'))).toBeUndefined();
    expect(readBugbotProgressCheckObservation(marker!, externalId.replace(head, 'c'.repeat(40)))).toBeUndefined();
    expect(readBugbotProgressCheckObservation(marker!, externalId.replace(':default:', ':' + 'c'.repeat(64) + ':'))).toBeUndefined();
    expect(readBugbotProgressCheckObservation(marker! + marker, externalId)).toBeUndefined();
});

test.each([
    { stage: 'untrusted' },
    { stage: 'finished' },
    { outcome: 'completed' },
    { sequence: 0 },
    { observedAt: '2026-02-31T20:46:28.847Z' },
    { observedAt: '2026-13-31T20:46:28.847Z' },
    { observedAt: 'not-a-time' },
    { elapsedMs: -1 },
    { headSha: 'c'.repeat(40) },
    { baseSha: 'c'.repeat(40) },
    { pullNumber: 952 },
    { baseRefSha: 'unbound' },
    { partitions: { completed: 111, total: 110 } },
    { frames: { ordinal: 0, total: 2 } },
    { candidates: { completed: 1, total: 0 } },
    { retries: 1.5 },
    { stageTimesMs: { analysis: 19 } },
    { stageTimesMs: { preparing: -1 } },
    { failureCode: '[link](https://example.invalid)' },
    { evidence: 'raw detector evidence' },
])('rejects invalid or unbounded observation %j at production and consumption', change => {
    const invalid = { ...observation, ...change } as BugbotReviewProgressObservation;
    expect(buildBugbotProgressCheckMarker(invalid, externalId)).toBeUndefined();
    expect(readBugbotProgressCheckObservation(forge({ externalId, observation: invalid }), externalId)).toBeUndefined();
});

it('preserves bounded terminal failure facts and rejects malformed envelopes', () => {
    const failed = { ...observation, stage: 'finished', outcome: 'failed', failureCode: 'workflow.failed' } as const;
    const marker = buildBugbotProgressCheckMarker(failed, externalId);
    expect(readBugbotProgressCheckObservation(marker!, externalId)).toEqual(failed);
    expect(readBugbotProgressCheckObservation('i'.repeat(20_000) + marker, externalId)).toBeUndefined();
    expect(readBugbotProgressCheckObservation('<!-- copilot-bugbot-progress:v1 YQ -->', externalId)).toBeUndefined();
    expect(readBugbotProgressCheckObservation('<!-- copilot-bugbot-progress:v1 YR -->', externalId)).toBeUndefined();
    expect(readBugbotProgressCheckObservation('<!-- copilot-bugbot-progress:v1 ??? -->', externalId)).toBeUndefined();
    expect(readBugbotProgressCheckObservation(forge({ externalId, observation, other: 1 }), externalId)).toBeUndefined();
    expect(buildBugbotProgressCheckMarker(observation, 'foreign')).toBeUndefined();
    expect(buildBugbotProgressCheckMarker(observation, externalId.replace(':14:', ':9999999999999999:'))).toBeUndefined();
});
