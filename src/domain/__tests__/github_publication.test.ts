import {
  publicationIdentityEquals,
  publicationTargetToken,
  type PublicationIntent,
  type PublicationIdentity,
} from '../github_publication';

const identity: PublicationIdentity = {
  topic: 'progress', target: { kind: 'issue', number: 7 }, key: 'work',
};

describe('GitHub publication domain', () => {
  it('compares all semantic identity components', () => {
    expect(publicationIdentityEquals(identity, { ...identity })).toBe(true);
    expect(publicationIdentityEquals(identity, { ...identity, topic: 'plan' })).toBe(false);
    expect(publicationIdentityEquals(identity, { ...identity, target: { kind: 'pull-request', number: 7 } })).toBe(false);
    expect(publicationIdentityEquals(identity, { ...identity, target: { kind: 'issue', number: 8 } })).toBe(false);
    expect(publicationIdentityEquals(identity, { ...identity, key: 'other' })).toBe(false);
  });

  it.each([
    [{ kind: 'issue', number: 12 }, 'issue:12'],
    [{ kind: 'pull-request', number: 13 }, 'pr:13'],
  ] as const)('renders a stable provider-independent target token', (target, expected) => {
    expect(publicationTargetToken(target)).toBe(expected);
  });

  it('keeps the publication union closed and discriminated', () => {
    const intents: PublicationIntent[] = [
      { kind: 'none', reason: 'routine' },
      { kind: 'reply', target: identity.target, correlationId: 'request-1', messageKey: 'done', locale: 'en-US', digest: '12345678', projection: {} },
      { kind: 'status', identity, sourceVersion: 'head:abc', digest: '12345678', locale: 'en-US', projection: {} },
      { kind: 'transition', identity, fingerprint: '12345678', messageKey: 'action', values: {} },
      { kind: 'inline-finding', identity: 'finding-1', path: 'src/a.ts', line: 1, severity: 'high', title: 'Unsafe input', evidence: 'Untrusted value reaches SQL.' },
    ];

    expect(intents.map(intent => intent.kind)).toEqual(['none', 'reply', 'status', 'transition', 'inline-finding']);
  });
});
