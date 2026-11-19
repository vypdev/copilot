import { renderBugbotStatusCard } from '../../../application/policies/bugbot_review_presentation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { decodeGithubBugbotStatusCardHandoff, encodeGithubBugbotStatusCardHandoff } from '../github_bugbot_status_card_handoff';

const source = { repositoryId: 19, pullNumber: 11, base: 'a'.repeat(40), baseRef: 'b'.repeat(40),
    head: 'c'.repeat(40), policy: 'd'.repeat(64) };
const progress = { kind: 'progress' as const, source, runId: 23, attempt: 2 };
const url = 'https://github.com/vypdev/copilot';

function terminal(head: string) {
    return renderBugbotStatusCard(buildBugbotReviewProjection({ pullRequestNumber: 11, analyzedHeadSha: head,
        verifiedHeadSha: head, findings: [], coverage: { status: 'complete', sources: [] } }),
    'en-US', { pullRequestUrl: url + '/pull/11', commitUrl: url + '/commit/' + head });
}

it('hands off only the scope and attempt for progress', () => {
    const encoded = encodeGithubBugbotStatusCardHandoff(progress)!;
    expect(Object.keys(JSON.parse(encoded.work))).toEqual(['version', 'kind', 'source', 'runId', 'attempt']);
    expect(decodeGithubBugbotStatusCardHandoff({ pullNumber: encoded.pull_number, work: encoded.work })).toEqual(progress);
    expect(decodeGithubBugbotStatusCardHandoff({ pullNumber: 12, work: encoded.work })).toBeUndefined();
});

it('accepts a recheck projection only for the exact reviewed head and matching pull-request scope', () => {
    const request = { ...progress, kind: 'state-refresh' as const, verifiedBody: terminal(source.head) };
    const encoded = encodeGithubBugbotStatusCardHandoff(request)!;
    expect(decodeGithubBugbotStatusCardHandoff({ pullNumber: encoded.pull_number, work: encoded.work })).toEqual(request);
    expect(encodeGithubBugbotStatusCardHandoff({ ...request, verifiedBody: terminal(source.base) })).toBeUndefined();
    expect(encodeGithubBugbotStatusCardHandoff({ ...request, source: { ...source, pullNumber: 12 } })).toBeUndefined();
});

it('rejects unrecognized fields, forged source shape and overlong UTF-8 payloads', () => {
    for (const override of [{ analystReasoning: 'raw' }, { runId: '23' }, { source: { ...source, policy: 'guess' } }]) {
        expect(decodeGithubBugbotStatusCardHandoff({ pullNumber: 11, work: JSON.stringify({
            version: 1, ...progress, ...override,
        }) })).toBeUndefined();
    }
    expect(encodeGithubBugbotStatusCardHandoff({
        ...progress, kind: 'analysis-result', verifiedBody: terminal(source.head) + 'añ'.repeat(24_000),
    })).toBeUndefined();
});
