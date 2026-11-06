import { sameBugbotFramedPullRequest, bugbotFramedSourceMatchesPullRequest } from '../bugbot_framed_identity_policy';
import { FRAME_IDENTITY, framedSource } from './fixtures/bugbot_framed_fixture';
import type { BugbotPullRequestIdentity } from '../../../domain/bugbot/context';
const id = FRAME_IDENTITY;
function identity(): BugbotPullRequestIdentity {
    return { number: id.pullRequestNumber, state: 'open', draft: false,
        baseRepository: { owner: id.owner, name: id.repository, id: id.repositoryId },
        baseRef: id.baseRef, baseSha: id.baseSha, baseRefSha: id.baseSha,
        headRepositoryOwner: id.headOwner, headRepositoryName: id.headRepository,
        headRef: id.headRef, headSha: id.headSha, changedFileCount: 1 };
}
it('binds the complete canonical snapshot and requires the live base for source admission', () => {
    expect(sameBugbotFramedPullRequest(identity(), identity())).toBe(true);
    expect(bugbotFramedSourceMatchesPullRequest(framedSource(), identity())).toBe(true);
    const first = { ...identity(), baseRefSha: undefined };
    expect(sameBugbotFramedPullRequest(first, identity())).toBe(true);
    expect(bugbotFramedSourceMatchesPullRequest(framedSource(), first)).toBe(false);
});
it.each(['number', 'draft', 'baseRepository', 'baseSha', 'baseRef', 'headRepositoryOwner', 'headRepositoryName',
    'headRef', 'headSha', 'changedFileCount'])('rejects missing %s even if both reads omit it', key => {
    const missing = { ...identity(), [key]: undefined };
    expect(sameBugbotFramedPullRequest(missing as any, missing as any)).toBe(false);
    expect(bugbotFramedSourceMatchesPullRequest(framedSource(), missing as any)).toBe(false);
});
it.each([
    { number: 8 }, { state: 'closed' }, { draft: true }, { baseSha: 'c'.repeat(40) }, { baseRefSha: 'c'.repeat(40) },
    { baseRefSha: undefined }, { baseRef: 'master' }, { headRef: 'foreign' }, { headSha: 'd'.repeat(40) },
    { headRepositoryName: 'fork' }, { headRepositoryOwner: 'other' }, { changedFileCount: 2 },
    { baseRepository: { owner: 'other', name: 'repo', id: 42 } }, { baseRepository: { owner: 'owner', name: 'foreign', id: 42 } },
    { baseRepository: { owner: 'owner', name: 'repo', id: 43 } },
])('invalidates changed provider identity %j', changed => {
    expect(sameBugbotFramedPullRequest(identity(), { ...identity(), ...changed } as any)).toBe(false);
});
it.each([{ baseSha: 'bad' }, { headSha: '' }, { changedFileCount: -1 }, { changedFileCount: NaN }, { number: 0 },
    { baseRefSha: null }, { baseRefSha: '0'.repeat(40) }])('rejects invalid runtime facts %j', changed => {
    const invalid = { ...identity(), ...changed };
    expect(sameBugbotFramedPullRequest(invalid as any, invalid as any)).toBe(false);
});
it('handles absent source and PR without throwing or admitting evidence', () => {
    expect(bugbotFramedSourceMatchesPullRequest(undefined as any, identity())).toBe(false);
    expect(bugbotFramedSourceMatchesPullRequest(framedSource(), undefined as any)).toBe(false);
});
