import { BugbotReviewService } from '../../../../../api';
import { fixture, clarifications, git } from '../../../../../tooling/__tests__/fixtures/bugbot_long_conversation_fixture';

it.each([
  ['PR15-shaped synthetic history', [4355, 2250, 5585, 4128, 6512, 6001, 1584, 13278]],
  ['PR19-shaped single long clarification', [38305]],
  ['PR22-shaped agent-authored proposals under a maintainer account', [17718, 17929]],
  ['51 short independent comments', Array(51).fill(50)],
])('delivers every source in %s to every partition before one final result', async (_name, lengths) => {
  const discussion = clarifications(lengths), f = fixture(discussion); const before = git('status', '--porcelain');
  const result = await f.run(); expect(result[0].success).toBe(true);
  expect(f.query.mock.calls.length).toBeGreaterThan(1);
  for (const [request] of f.query.mock.calls) {
    discussion.forEach((_, i) => expect(request.prompt).toContain(`SOURCE_${i}_END`));
    expect(request.prompt).toContain('not personal endorsement');
    expect(request.prompt).not.toContain('older discussion items omitted');
  }
  const payload = result[0].payload as any;
  expect(payload.bugbotTelemetry.contextCoverage['human-conversation'])
    .toMatchObject({ status: 'complete', itemsFetched: discussion.length, itemsRetained: discussion.length, omittedItems: 0, truncatedItems: 0 });
  expect(f.firstMutationAfterCalls).toBe(f.query.mock.calls.length);
  expect(git('status', '--porcelain')).toBe(before);
});
it('excludes only configured/native automated authors and retains an ordinary maintainer-account technical source', async () => {
  const discussion = [...clarifications([38305]),
    { id: 10, body: 'CONFIGURED_BOT_ONLY'.repeat(2000), user: { login: 'BOT' } },
    { id: 11, body: 'AUTOMATED_ONLY'.repeat(2000), user: { login: 'scanner' }, isAutomatedAuthor: true }];
  const f = fixture(discussion); const result = await f.run(); expect(result[0].success).toBe(true);
  for (const [request] of f.query.mock.calls) {
    expect(request.prompt).toContain('SOURCE_0_END'); expect(request.prompt).not.toContain('CONFIGURED_BOT_ONLY');
    expect(request.prompt).not.toContain('AUTOMATED_ONLY');
  }
});
it('keeps provider enumeration partial even when all fetched discussion text fits', async () => {
  const f = fixture(clarifications([38305])); const original = f.scm.context.listIssueComments;
  f.scm.context.listIssueComments = async number => {
    const read = await original(number); return { ...read, coverage: { ...read.coverage, status: 'partial', providerLimitReached: true, limitReached: true } };
  };
  const result = await f.run(); expect(result[0].success).toBe(true);
  const telemetry = (result[0].payload as any).bugbotTelemetry;
  expect(telemetry.contextCoverageStatus).toBe('partial'); expect(telemetry.outcome).toBe('partial');
  expect(telemetry.contextCoverage['human-conversation'].status).toBe('complete');
});
it('preserves truthful legacy partial behavior for a caller without a read-only source capability', async () => {
  const f = fixture(clarifications([38305])); (f.scm as any).reviewSource = undefined;
  // The fallback remains the legacy partition response shape, which cannot claim full context.
  f.query.mockImplementation(async request => {
    const p = (request.options!.schema as any).properties;
    return { outputLocale: 'en-US', partition_id: p.partition_id.enum[0], reviewed_head_sha: p.reviewed_head_sha.enum[0], findings: [], resolved_findings: [] } as any;
  });
  const result = await f.run(); expect(result[0].success).toBe(true);
  expect((result[0].payload as any).bugbotTelemetry.contextCoverageStatus).toBe('partial');
  expect((result[0].payload as any).bugbotTelemetry.outcome).toBe('partial');
});
it('fails before delegation when source capability lacks the source-bound identity read', async () => {
  const f = fixture(clarifications([38305])); f.scm.context.getSourceBoundPullRequest = undefined;
  const result = await f.run(); expect(result[0].success).toBe(false);
  expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).toEqual([]);
});
it('enforces actual UTF-8 prompt capacity before even the first reviewer call', async () => {
  const f = fixture([{ id: 1, body: '漢'.repeat(180000), user: { login: 'maintainer' } }]);
  const result = await f.run(); expect(result[0].success).toBe(false);
  expect(result[0].errors?.[0]).toMatchObject({ retryable: false, recovery: { id: 'bugbot-review-incomplete' } });
  expect(result[0].errors?.[0].recovery?.variables).toMatchObject({ resource: 'promptBytes' });
  expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).toEqual([]);
});
it.each(['headSha', 'baseRefSha'] as const)('discards completed context analysis when the live %s moves', async field => {
  const f = fixture(clarifications([38305])); const read = f.scm.context.getSourceBoundPullRequest!;
  let changed = false; f.scm.context.getSourceBoundPullRequest = async number => {
    const id = await read(number); return changed ? { ...id, [field]: 'f'.repeat(40) } : id;
  };
  const query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async request => { const response = await query(request); changed = true; return response; });
  const result = await f.run(); expect(result[0].success).toBe(false); expect(f.query).toHaveBeenCalled(); expect(f.mutations).toEqual([]);
});
it('rejects a foreign source-bound receipt after exactly three identical attempts without mutation', async () => {
  const f = fixture(clarifications([38305])); const query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async request => ({ ...await query(request), review_manifest_digest: '0'.repeat(64) }));
  const result = await f.run(); expect(result[0].success).toBe(false); expect(f.mutations).toEqual([]);
  const requests = f.query.mock.calls.map(([request]) => request);
  const first = requests[0]; expect(requests.filter(request => request.prompt === first.prompt)).toHaveLength(3);
});
it('does not allow a non-owner context-complete partition to resolve a retained finding', async () => {
  const f = fixture(clarifications([38305])); const query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async request => ({ ...await query(request),
    resolved_findings: request.prompt.includes('not the resolution owner; resolved_findings must be an empty array') ? [{ id: 'prior', resolution: 'fixed' }] : [] }));
  const result = await f.run(); expect(result[0].success).toBe(false); expect(f.mutations).toEqual([]);
});
it('does not publish partial work after the later partition repeatedly loses its provider connection', async () => {
  const f = fixture(clarifications([38305])); const query = f.query.getMockImplementation()!;
  f.query.mockImplementation(async request => {
    if (request.prompt.includes('not the resolution owner; resolved_findings must be an empty array')) throw new Error('disconnected');
    return query(request);
  });
  const result = await f.run(); expect(result[0].success).toBe(false); expect(f.mutations).toEqual([]);
});
it('recovers a missing required patch from the immutable local Git source before contextual review', async () => {
  const f = fixture(clarifications([38305])); const read = f.scm.context.getReviewDiffSnapshot;
  f.scm.context.getReviewDiffSnapshot = async number => { const snapshot = await read(number);
    return { ...snapshot, value: { ...snapshot.value, changes: snapshot.value.changes.map((change, index) => ({ ...change, patch: index === 0 ? '' : change.patch })) } }; };
  const result = await f.run(); expect(result[0].success).toBe(true);
  expect((result[0].payload as any).bugbotTelemetry.framedReview.source.recoveredFiles).toBe(1);
  expect(f.query.mock.calls.every(([request]) => request.prompt.includes('SOURCE_0_END'))).toBe(true);
});
it('supports the public API dry-run with complete contextual review and no SCM writes', async () => {
  const f = fixture(clarifications([38305]), 'dry-run');
  const service = new BugbotReviewService({ query: f.query }, { ...f.scm, repository: f.operation.repository });
  const result = await service.review({ target: { kind: 'pull-request', number: 7, linkedIssueNumber: 7, head: 'feature/review', base: 'develop' },
    agent: { provider: 'codex', modelProvider: 'openai', model: 'fixture', executable: 'codex' }, configuration: { publicationMode: 'dry-run' } });
  expect(result[0].errors).toEqual([]);
  expect(result[0].success).toBe(true); expect(f.mutations).toEqual([]);
  expect((result[0].payload as any).bugbotTelemetry.contextCoverageStatus).toBe('complete');
  expect(f.query.mock.calls.length).toBeGreaterThan(1);
  expect(f.query.mock.calls.every(([request]) => request.prompt.includes('SOURCE_0_END'))).toBe(true);
});
