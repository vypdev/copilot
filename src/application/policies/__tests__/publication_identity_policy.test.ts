import {
  buildDuplicateMarker,
  buildPublicationMarker,
  buildPublicationReplyMarker,
  buildPublicationTransitionMarker,
  createSemanticDigest,
  createTransitionFingerprint,
  parsePublicationMarker,
  parsePublicationReplyMarker,
  parsePublicationTransitionMarker,
  readablePublicationReplyCorrelationIds,
} from '../publication_identity_policy';

const marker = {
  identity: { topic: 'progress' as const, target: { kind: 'issue' as const, number: 42 }, key: 'work' },
  sourceVersion: 'head:abc1234',
  digest: '0123abcd',
};

describe('publication identity policy', () => {
  it('round-trips a strict shared marker', () => {
    const rendered = buildPublicationMarker(marker);

    expect(rendered).toBe('<!-- copilot:publication schema="1" topic="progress" target="issue:42" key="work" source="head:abc1234" digest="0123abcd" -->');
    expect(parsePublicationMarker(`prefix\n${rendered}\nsuffix`)).toEqual(marker);
  });

  it('round-trips pull-request targets', () => {
    const value = { ...marker, identity: { ...marker.identity, target: { kind: 'pull-request' as const, number: 9 } } };
    expect(parsePublicationMarker(buildPublicationMarker(value))?.identity.target).toEqual({ kind: 'pull-request', number: 9 });
  });

  it.each([
    undefined,
    null,
    '',
    '<!-- copilot:publication schema="2" topic="progress" target="issue:42" key="work" source="head:abc" digest="0123abcd" -->',
    '<!-- copilot:publication schema="1" topic="unknown" target="issue:42" key="work" source="head:abc" digest="0123abcd" -->',
    '<!-- copilot:publication schema="1" topic="progress" target="issue:0" key="work" source="head:abc" digest="0123abcd" -->',
    '<!-- copilot:publication schema="1" topic="progress" target="issue:42" key="work" source="head:abc" digest="xyz" -->',
  ])('treats malformed or unknown markers as inert: %p', (body) => {
    expect(parsePublicationMarker(body)).toBeUndefined();
  });

  it.each([
    { ...marker, identity: { ...marker.identity, key: 'unsafe key' } },
    { ...marker, sourceVersion: 'unsafe/source' },
    { ...marker, digest: 'not-hex' },
  ])('rejects unsafe marker construction', (value) => {
    expect(() => buildPublicationMarker(value)).toThrow();
  });

  it('creates stable order-independent semantic digests', () => {
    expect(createSemanticDigest({ b: 2, a: [1, 'x'] })).toBe(createSemanticDigest({ a: [1, 'x'], b: 2 }));
    expect(createSemanticDigest({ a: 1 })).not.toBe(createSemanticDigest({ a: 2 }));
    expect(createSemanticDigest(undefined)).toHaveLength(16);
  });

  it('builds only valid duplicate tombstones', () => {
    expect(buildDuplicateMarker(12)).toContain('canonical="12"');
    expect(() => buildDuplicateMarker(0)).toThrow('positive integer');
    expect(() => buildDuplicateMarker(1.5)).toThrow('positive integer');
  });

  it('round-trips strict reply correlation metadata', () => {
    const reply = { target: 'issue:42', correlationId: 'comment:99', messageKey: 'copilot-help', digest: '0123abcd' };
    expect(parsePublicationReplyMarker(buildPublicationReplyMarker(reply))).toEqual(reply);
  });

  it.each([
    '<!-- copilot:reply schema="2" target="issue:42" correlation="comment:99" key="copilot-help" digest="0123abcd" -->',
    '<!-- copilot:reply schema="1" target="repo:42" correlation="comment:99" key="copilot-help" digest="0123abcd" -->',
    '<!-- copilot:reply schema="1" target="issue:42" correlation="unsafe value" key="copilot-help" digest="0123abcd" -->',
  ])('treats malformed reply markers as inert', (body) => {
    expect(parsePublicationReplyMarker(body)).toBeUndefined();
  });

  it('rejects unsafe reply marker construction', () => {
    expect(() => buildPublicationReplyMarker({
      target: 'issue:42', correlationId: 'unsafe value', messageKey: 'copilot-help', digest: '0123abcd',
    })).toThrow('unsafe identity');
    expect(() => buildPublicationReplyMarker({
      target: 'issue:42', correlationId: 'comment:99', messageKey: 'copilot-help', digest: 'invalid',
    })).toThrow('invalid digest');
    expect(parsePublicationReplyMarker(null)).toBeUndefined();
  });

  it('reads the transient issue-comment namespace without widening review correlations', () => {
    expect(readablePublicationReplyCorrelationIds('comment:99')).toEqual([
      'comment:99',
      'comment:issue_comment:99',
    ]);
    expect(readablePublicationReplyCorrelationIds(
      'comment:pull_request_review_comment:99',
    )).toEqual(['comment:pull_request_review_comment:99']);
    expect(readablePublicationReplyCorrelationIds('event:0123abcd')).toEqual([
      'event:0123abcd',
    ]);
  });

  it('round-trips strict issue and pull-request transition markers', () => {
    const transition = {
      identity: { topic: 'branch-sync' as const, target: { kind: 'issue' as const, number: 42 }, key: 'develop:feature-42' },
      fingerprint: '0123abcd',
      messageKey: 'branch-sync-action-required',
    };
    expect(parsePublicationTransitionMarker(buildPublicationTransitionMarker(transition))).toEqual(transition);

    const pullRequest = {
      ...transition,
      identity: { ...transition.identity, target: { kind: 'pull-request' as const, number: 9 } },
    };
    expect(parsePublicationTransitionMarker(buildPublicationTransitionMarker(pullRequest))?.identity.target)
      .toEqual({ kind: 'pull-request', number: 9 });
  });

  it.each([
    undefined,
    null,
    '',
    '<!-- copilot:transition schema="2" topic="branch-sync" target="issue:42" key="sync" fingerprint="0123abcd" message="action" -->',
    '<!-- copilot:transition schema="1" topic="unknown" target="issue:42" key="sync" fingerprint="0123abcd" message="action" -->',
    '<!-- copilot:transition schema="1" topic="branch-sync" target="issue:0" key="sync" fingerprint="0123abcd" message="action" -->',
    '<!-- copilot:transition schema="1" topic="branch-sync" target="issue:42" key="sync" fingerprint="invalid" message="action" -->',
  ])('treats malformed transition markers as inert: %p', (body) => {
    expect(parsePublicationTransitionMarker(body)).toBeUndefined();
  });

  it('rejects unsafe transition-marker construction', () => {
    const transition = {
      identity: { topic: 'branch-sync' as const, target: { kind: 'issue' as const, number: 42 }, key: 'sync' },
      fingerprint: '0123abcd',
      messageKey: 'action',
    };
    expect(() => buildPublicationTransitionMarker({
      ...transition, identity: { ...transition.identity, key: 'unsafe key' },
    })).toThrow('unsafe identity');
    expect(() => buildPublicationTransitionMarker({ ...transition, fingerprint: 'invalid' }))
      .toThrow('invalid fingerprint');
    expect(() => buildPublicationTransitionMarker({
      ...transition, identity: { ...transition.identity, target: { kind: 'issue', number: 0 } },
    })).toThrow('positive safe integer');
  });

  it('derives stable transition fingerprints from closed trusted facts', () => {
    const identity = { topic: 'branch-sync' as const, target: { kind: 'issue' as const, number: 42 }, key: 'develop:feature-42' };
    const fingerprint = createTransitionFingerprint(identity, 'branch-sync-required', 'head:abc1234');

    expect(fingerprint).toHaveLength(16);
    expect(createTransitionFingerprint(identity, 'branch-sync-required', 'head:abc1234')).toBe(fingerprint);
    expect(createTransitionFingerprint(identity, 'branch-sync-required', 'head:def5678')).not.toBe(fingerprint);
    expect(createTransitionFingerprint({ ...identity, key: 'develop:feature-43' }, 'branch-sync-required', 'head:abc1234'))
      .not.toBe(fingerprint);
    expect(() => createTransitionFingerprint(identity, 'branch-sync-required', 'unsafe/source'))
      .toThrow('unsafe identity');
    expect(() => createTransitionFingerprint(identity, 'unknown' as never, 'head:abc1234'))
      .toThrow('unknown action');
    expect(() => createTransitionFingerprint({
      ...identity, target: { kind: 'issue', number: Number.NaN },
    }, 'branch-sync-required', 'head:abc1234')).toThrow('positive safe integer');
  });
});
