import type { BugbotFramedReviewIdentity, BugbotFramedReviewSource, BugbotFramedChange } from '../../../../domain/bugbot/framed_review';
export const FRAME_IDENTITY: BugbotFramedReviewIdentity = {
    owner: 'owner', repository: 'repo', repositoryId: 42, pullRequestNumber: 7,
    baseRef: 'develop', baseSha: 'a'.repeat(40), headOwner: 'owner', headRepository: 'repo',
    headRef: 'feature/review', headSha: 'b'.repeat(40), mergeBaseSha: 'a'.repeat(40),
};
export const FRAME_NONCE = 'd'.repeat(32);
export const FRAME_CONTEXT = 'e'.repeat(64);
export function framedChange(overrides: Partial<BugbotFramedChange> = {}): BugbotFramedChange {
    return { filename: 'src/example.ts', status: 'modified', additions: 1, deletions: 1,
        patch: '@@ -1 +1 @@\n-old\n+new\n', source: 'provider', ...overrides };
}
export function framedSource(changes: readonly BugbotFramedChange[] = [framedChange()],
    identity: Partial<BugbotFramedReviewIdentity> = {}): BugbotFramedReviewSource {
    return { identity: { ...FRAME_IDENTITY, ...identity }, complete: true, changes };
}
export function framedFiles(count: number): BugbotFramedReviewSource {
    const patch = 'a'.repeat(48_000);
    return framedSource(Array.from({ length: count }, (_, index) => framedChange({ filename: `src/file-${index}.ts`, patch })));
}
