import { runAdmittedGithubBugbotStatusCardJob } from '../github_bugbot_status_card_lane';
import { buildBugbotProgressCheckMarker } from '../../../application/policies/bugbot_progress_check_observation_policy';
import { renderBugbotStatusCard } from '../../../application/policies/bugbot_review_presentation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';

const repositoryUrl = 'https://github.com/vypdev/copilot';
const source = { repositoryId: 19, pullNumber: 11, base: 'a'.repeat(40), baseRef: 'b'.repeat(40),
    head: 'c'.repeat(40), policy: 'd'.repeat(64) };
const wakeup = { source, runId: 23, attempt: 2, dryRun: false };
const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, 23, 2].join(':');
const checkDetails = buildBugbotProgressCheckMarker({
    stage: 'verifying', headSha: source.head, baseSha: source.base, baseRefSha: source.baseRef, pullNumber: source.pullNumber,
    elapsedMs: 71000, observedAt: '2026-11-18T04:31:00.000Z', sequence: 3, candidates: { completed: 0, total: 3 },
}, externalId)!;
const native = { state: 'active' as const, runId: 23, attempt: 2, checkDetails,
    runUrl: repositoryUrl + '/actions/runs/23/attempts/2' };
const existing = renderBugbotStatusCard(buildBugbotReviewProjection({
    pullRequestNumber: source.pullNumber, analyzedHeadSha: source.base, verifiedHeadSha: source.base,
    findings: [], coverage: { status: 'complete', sources: [] },
}), 'en-US', { pullRequestUrl: repositoryUrl + '/pull/11', commitUrl: repositoryUrl + '/commit/' + source.base });

function fixture() {
    return {
        repositoryId: 19, pullNumber: 11, repositoryUrl, locale: 'en-US', trustedAuthorLogin: 'vypbot',
        readSource: jest.fn(async () => source),
        readReview: jest.fn(async () => native),
        readComments: jest.fn(async () => [
            { id: 54, body: existing, user: { login: 'unknown' } },
            { id: 55, body: existing, user: { login: 'vypbot' } },
        ]),
        createComment: jest.fn(async () => {}),
        updateComment: jest.fn(async () => {}),
    };
}

it('adopts only the comment from the trusted author and rechecks its source immediately before updating', async () => {
    const job = fixture();
    await expect(runAdmittedGithubBugbotStatusCardJob(wakeup, job)).resolves.toBe('updated');
    expect(job.updateComment).toHaveBeenCalledWith(55, expect.stringContaining('0/3 candidate dispositions validated'));
    expect(job.readSource).toHaveBeenCalledTimes(3);
    expect(job.readComments).toHaveBeenCalledTimes(2);
    expect(job.createComment).not.toHaveBeenCalled();
});

it('skips the mutation if a push supersedes the snapshot on the last source check', async () => {
    const job = fixture();
    job.readSource.mockResolvedValueOnce(source).mockResolvedValueOnce(source)
        .mockResolvedValueOnce({ ...source, head: 'e'.repeat(40) });
    await expect(runAdmittedGithubBugbotStatusCardJob(wakeup, job)).resolves.toBe('skipped');
    expect(job.updateComment).not.toHaveBeenCalled();
    expect(job.createComment).not.toHaveBeenCalled();
});

it('keeps the check usable when the canonical conversation is ambiguous or a job is write-blocked', async () => {
    const job = fixture();
    job.readComments.mockResolvedValueOnce([53, 55].map(id => ({
        id, body: existing, user: { login: 'vypbot' },
    })));
    await expect(runAdmittedGithubBugbotStatusCardJob(wakeup, job)).resolves.toBe('skipped');
    await expect(runAdmittedGithubBugbotStatusCardJob({ ...wakeup, dryRun: true }, job)).resolves.toBe('dry-run');
    expect(job.readComments).toHaveBeenCalledTimes(1);
    expect(job.updateComment).not.toHaveBeenCalled();
    expect(job.createComment).not.toHaveBeenCalled();
});
