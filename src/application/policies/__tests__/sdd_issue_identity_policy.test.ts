import { createHash } from 'node:crypto';
import { buildSddIssueDigest } from '../sdd_issue_identity_policy';

const identity = { issueNumber: 42, issueTitle: 'Change payments', issueBody: 'Preserve verified callers.', admittedKind: 'feature', profileDigest: 'profile' };
const base = 'a'.repeat(40);

describe('shared SDD issue identity', () => {
    it('retains the legacy empty-profile digest without substituting an unrelated profile', () => {
        expect(buildSddIssueDigest({ ...identity, profileDigest: undefined }, base)).toBe(buildSddIssueDigest({ ...identity, profileDigest: '' }, base));
        expect(buildSddIssueDigest({ ...identity, profileDigest: undefined }, base)).not.toBe(buildSddIssueDigest(identity, base));
    });
    it('retains byte-for-byte compatibility with already published gate digests', () => {
        expect(buildSddIssueDigest(identity, base)).toBe(createHash('sha256').update(JSON.stringify([
            42, 'Change payments', 'Preserve verified callers.', 'feature', 'profile', base,
        ])).digest('hex'));
    });
    it('ignores the Action title decoration without ignoring a human title edit', () => {
        expect(buildSddIssueDigest({ ...identity, issueTitle: '✨ - Change payments' }, base)).toBe(buildSddIssueDigest(identity, base));
        expect(buildSddIssueDigest({ ...identity, issueTitle: 'Change authorization' }, base)).not.toBe(buildSddIssueDigest(identity, base));
    });
    it.each(['issueNumber', 'issueBody', 'admittedKind', 'profileDigest'] as const)('binds the digest to the current %s', field => {
        const changed = { ...identity, [field]: field === 'issueNumber' ? 43 : 'changed' };
        expect(buildSddIssueDigest(changed, base)).not.toBe(buildSddIssueDigest(identity, base));
    });
    it('binds the digest to the immutable first base rather than a moving development tip', () => {
        expect(buildSddIssueDigest(identity, 'b'.repeat(40))).not.toBe(buildSddIssueDigest(identity, base));
    });
});
