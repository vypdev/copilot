import { attachPendingPullRequestLink as attach, createPendingPullRequestLink as create,
  readPendingPullRequestLink as read, removePendingPullRequestLink as remove,
  preservePendingPullRequestLink as preserve, pendingPullRequestParent as parent,
  isOpenPullRequestLinkIdentity as open, MAX_PENDING_LINK_BODY } from '../pull_request_issue_link_state';

const input = { pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
  operationId: '11111111-1111-4111-8111-111111111111', headRepository: 'owner/repo',
  headRef: 'bugfix/42-work', headSha: 'a'.repeat(40) };
const legacy = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
const ref = '\n\nResolves #42\n\n';
const legacyBody = `Human${ref}${legacy}`;
const marker = () => create(input);
const body = () => attach('Human', marker());

describe('durable pending PR link policy', () => {
  it.each(['a//b', 'a/.hidden', 'a.lock/b', '.hidden', 'a/.', 'a/.hidden/b'])(
    'rejects impossible Git ref components before accepting recovery state: %s', base => {
      expect(() => create({ ...input, originalBaseBranch: base })).toThrow();
      expect(() => create({ ...input, headRef: base })).toThrow();
      expect(read(legacyBody.replace('base=develop', `base=${encodeURIComponent(base)}`)).kind).toBe('blocked');
      expect(open({ number: 10, state: 'open', repository: 'owner/repo', headRepository: input.headRepository,
        headRef: base, headSha: input.headSha }, 10)).toBe(false);
    });
  it('recognizes absence and rejects non-string input', () => {
    expect(read('Human')).toEqual({ kind: 'none' });
    expect(read(undefined as never).kind).toBe('blocked');
    expect(parent('Human', 10, 42)).toBeUndefined();
  });
  it('reads the V1 original parent independently of a newer event base', () => {
    expect(read(legacyBody)).toMatchObject({ kind: 'pending', record: { version: 1, originalBaseBranch: 'develop' } });
    expect(parent(legacyBody, 10, 42)).toBe('develop');
  });
  it('round-trips the closed V2 identity and encoded branch', () => {
    const encoded = create({ ...input, originalBaseBranch: 'release/2.0', headSha: 'B'.repeat(64) });
    expect(read(attach('', encoded))).toMatchObject({ kind: 'pending', record: { ...input,
      version: 2, originalBaseBranch: 'release/2.0', headSha: 'B'.repeat(64) } });
    const dotRepository = create({ ...input, headRepository: 'owner/.github' });
    expect(read(attach('', dotRepository))).toMatchObject({ kind: 'pending', record: { headRepository: 'owner/.github' } });
    expect(open({ number: 10, state: 'open', repository: 'owner/.github', headRepository: 'owner/.github', headRef: input.headRef, headSha: input.headSha }, 10)).toBe(true);
  });
  it('blocks invalid percent encoding and incomplete markers', () => {
    expect(read(legacyBody.replace('develop', '%XX')).kind).toBe('blocked');
    expect(read(legacyBody.slice(0, -3)).kind).toBe('blocked');
    expect(read('<!-- copilot:pr-issue-link:v2;data=%XX;state=pending -->').kind).toBe('blocked');
  });
  it('blocks unknown versions and malformed JSON rather than ignoring them', () => {
    expect(read(legacyBody.replace(':v1;', ':v3;')).kind).toBe('blocked');
    expect(read('<!-- copilot:pr-issue-link:v2;data=bad;state=pending -->').kind).toBe('blocked');
  });
  it('blocks duplicate operation records', () => {
    expect(read(`${legacyBody}${ref}${legacy}`)).toMatchObject({ kind: 'blocked', reason: 'ambiguous' });
  });
  it('requires the exact owned temporary issue reference', () => {
    expect(read(`Human${legacy}`).kind).toBe('blocked');
    expect(read(legacy).kind).toBe('blocked');
    expect(read(legacyBody.replace('Resolves #42', 'Resolves #41')).kind).toBe('blocked');
  });
  it('rejects unsafe original parents and unsafe legacy identities', () => {
    for (const base of ['', '../unsafe', 'a..b', ' develop ', 'bad\0ref', 'bad\x7fref', 'bad.', 'bad.lock', '/absolute', 'tail/', '@{bad', 'a b', '~bad', 'x'.repeat(101), 'x'.repeat(1025)]) {
      expect(() => create({ ...input, originalBaseBranch: base })).toThrow();
      expect(read(legacyBody.replace('base=develop', `base=${encodeURIComponent(base)}`)).kind).toBe('blocked');
    }
  });
  it('bounds input bodies even when no marker occurs', () => {
    expect(read('x'.repeat(MAX_PENDING_LINK_BODY + 1))).toMatchObject({ kind: 'blocked', reason: 'oversized' });
    expect(() => attach('x'.repeat(MAX_PENDING_LINK_BODY), marker())).toThrow();
  });
  it('bounds encoded marker size', () => {
    expect(read(`<!-- copilot:pr-issue-link:${'x'.repeat(4096)} -->`)).toMatchObject({ kind: 'blocked', reason: 'oversized' });
    expect(() => create({ ...input, headRef: '界'.repeat(1000) })).toThrow();
    expect(create({ ...input, headRef: 'x'.repeat(200) })).toContain(':v2;');
    expect(() => attach('', legacy.replace('pr=10', `pr=${'0'.repeat(4096)}10`))).toThrow();
    expect(create({ ...input, originalBaseBranch: '界'.repeat(100), headRef: '界'.repeat(100), headRepository: `o/${'r'.repeat(510)}` }).length).toBeLessThanOrEqual(4096);
  });
  it('uses a closed schema for writes and reads', () => {
    for (const value of [null, [], { ...input, extra: true }, { ...input, version: 2 }]) {
      expect(() => create(value as never)).toThrow();
    }
    const invalid = `<!-- copilot:pr-issue-link:v2;data=${encodeURIComponent(JSON.stringify({ version: 2, ...input, extra: true }))};state=pending -->`;
    expect(read(`${ref}${invalid}`).kind).toBe('blocked');
  });
  it('requires an opaque valid operation ID', () => {
    for (const operationId of ['', 'same-operation', undefined]) expect(() => create({ ...input, operationId } as never)).toThrow();
  });
  it('requires a bounded native repository identity', () => {
    for (const headRepository of ['', '../repo', 'owner/..', 'owner/a/b', 'x'.repeat(513), undefined]) {
      expect(() => create({ ...input, headRepository } as never)).toThrow();
    }
  });
  it('requires a complete native head SHA', () => {
    for (const headSha of ['', 'g'.repeat(40), 'a'.repeat(39), undefined]) expect(() => create({ ...input, headSha } as never)).toThrow();
  });
  it('requires a safe complete native ref', () => {
    for (const headRef of ['', '../unsafe', undefined]) expect(() => create({ ...input, headRef } as never)).toThrow();
  });
  it('rejects non-positive and non-safe numeric identities', () => {
    for (const pullRequestNumber of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1, '10']) {
      expect(() => create({ ...input, pullRequestNumber } as never)).toThrow();
    }
    expect(() => create({ ...input, issueNumber: 0 })).toThrow();
  });
  it('rejects self links and requires an authenticated open native identity', () => {
    expect(() => create({ ...input, issueNumber: 10 })).toThrow();
    const identity = { number: 10, state: 'open' as const, repository: 'owner/repo', headRepository: input.headRepository, headRef: input.headRef, headSha: input.headSha };
    expect(open(identity, 10)).toBe(true);
    expect(open(undefined, 10)).toBe(false);
    for (const change of [{ number: 11 }, { state: 'closed' }, { repository: '../repo' }, { headRepository: '../repo' }, { headRef: '../bad' }, { headSha: '' }]) {
      expect(open({ ...identity, ...change } as never, 10)).toBe(false);
    }
  });
  it('refuses to layer another operation or attach invalid metadata', () => {
    expect(() => attach(body(), marker())).toThrow();
    expect(() => attach('<!-- copilot:pr-issue-link:bad', marker())).toThrow();
    expect(() => attach('', 'invalid')).toThrow();
  });
  it('bounds the combined body at the exact provider boundary', () => {
    const suffix = attach('', marker());
    const exact = attach('x'.repeat(MAX_PENDING_LINK_BODY - suffix.length), marker());
    expect(exact).toHaveLength(MAX_PENDING_LINK_BODY);
    expect(() => attach(`${exact}x`, marker())).toThrow();
  });
  it('removes only owned bytes and retains concurrently appended configuration', () => {
    expect(remove(`${body()}\nCurrent configuration`, marker())).toBe('Human\nCurrent configuration');
    expect(remove(legacyBody, legacy)).toBe('Human');
  });
  it('refuses removal of another operation or absent/invalid state', () => {
    for (const current of ['Human', '<!-- copilot:pr-issue-link:bad', body()]) {
      expect(() => remove(current, 'another marker')).toThrow();
    }
  });
  it('preserves host state across replace, append and identical rendering', () => {
    expect(preserve(legacyBody, 'Generated')).toBe(`Generated${ref}${legacy}`);
    expect(preserve(legacyBody, `${legacyBody}\nMore`)).toBe(`Human\nMore${ref}${legacy}`);
    expect(preserve(body(), body())).toBe(body());
    expect(preserve('Human', 'Generated')).toBe('Generated');
  });
  it('rejects injected, replaced or malformed model-owned recovery records', () => {
    expect(() => preserve('Human', body())).toThrow();
    expect(() => preserve(body(), legacyBody)).toThrow();
    expect(() => preserve('Human', '<!-- copilot:pr-issue-link:bad')).toThrow();
    expect(() => preserve('<!-- copilot:pr-issue-link:bad', 'Human')).toThrow();
  });
  it('never projects another issue or PR parent and rejects blocked metadata', () => {
    expect(() => parent(legacyBody, 11, 42)).toThrow();
    expect(() => parent(legacyBody, 10, 43)).toThrow();
    expect(() => parent('<!-- copilot:pr-issue-link:bad', 10, 42)).toThrow();
  });
});
