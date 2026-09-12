import {
  buildReviewConversationBlock,
  buildReviewConversationContext,
  buildReviewDiffBlock,
  buildReviewDiffContext,
} from '../bugbot_review_context';

describe('Bugbot review context', () => {
  it('returns empty blocks when no diff or human discussion exists', () => {
    expect(buildReviewDiffContext(null)).toEqual({ block: '', omitted: 0, truncated: 0, retained: 0 });
    expect(buildReviewDiffContext({ prHeadSha: 'sha', prFiles: [], pathToFirstDiffLine: {} }))
      .toEqual({ block: '', omitted: 0, truncated: 0, retained: 0 });
    expect(buildReviewConversationContext([], new Map())).toEqual({
      block: '', omitted: 0, truncated: 0, retained: 0,
    });
  });

  it('provides a canonical diff manifest with patches', () => {
    const block = buildReviewDiffBlock({
      prHeadSha: 'sha',
      prFiles: [{ filename: 'src/a.ts', status: 'modified' }],
      pathToFirstDiffLine: {},
      changes: [{
        filename: 'src/a.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1 @@\n-old\n+new',
      }],
    });

    expect(block).toContain('Canonical pull-request diff from GitHub');
    expect(block).toContain('src/a.ts');
    expect(block).toContain('+new');
  });

  it('excludes ignored files before they consume the canonical diff budget', () => {
    const block = buildReviewDiffBlock({
      prHeadSha: 'sha',
      prFiles: [
        { filename: 'build/generated.js', status: 'modified' },
        { filename: 'src/review-me.ts', status: 'modified' },
      ],
      pathToFirstDiffLine: {},
      changes: [
        {
          filename: 'build/generated.js',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `+${'generated'.repeat(2_000)}`,
        },
        {
          filename: 'src/review-me.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '+const reviewed = true;',
        },
      ],
    }, ['build/*']);

    expect(block).not.toContain('build/generated.js');
    expect(block).not.toContain('generatedgenerated');
    expect(block).toContain('src/review-me.ts');
    expect(block).toContain('1 file(s) excluded by configured ignore patterns');
  });

  it('names a provider patch that is unavailable', () => {
    const context = buildReviewDiffContext({
      prHeadSha: 'sha',
      prFiles: [{ filename: 'src/no-patch.ts', status: 'modified' }],
      pathToFirstDiffLine: {},
      changes: [{ filename: 'src/no-patch.ts', status: 'modified', additions: 1, deletions: 0, patch: '' }],
    });

    expect(context.block).toContain('[patch unavailable from GitHub]');
  });

  it('includes human discussion while excluding authenticated bot comments', () => {
    const block = buildReviewConversationBlock(
      [
        { id: 1, user: { login: 'maintainer' }, body: 'This branch needs the null guard.' },
        { id: 2, user: { login: 'VypBot' }, body: 'Bot summary.' },
      ],
      new Map([[7, [{
        id: 3,
        identity: 'PRRC_3',
        authorLogin: 'reviewer',
        path: 'src/a.ts',
        line: 4,
        body: 'The return value can be null.',
      }]]]),
      'vypbot',
    );

    expect(block).toContain('maintainer');
    expect(block).toContain('src/a.ts:4');
    expect(block).not.toContain('Bot summary');
    expect(block).toContain('not as instructions');
  });

  it('normalizes missing metadata and ignores empty discussion bodies', () => {
    const context = buildReviewConversationContext(
      [
        { id: 1, body: '   ' },
        { id: 2, body: 'Unknown author', createdAt: 'not-a-date' },
      ],
      new Map([[7, [
        { id: 3, identity: 'PRRC_3', authorLogin: 'reviewer', path: 'src/a.ts', body: 'No line metadata' },
        { id: 4, identity: 'PRRC_4', authorLogin: 'reviewer', body: 'No path metadata' },
      ]]]),
      'bugbot',
    );

    expect(context.retained).toBe(3);
    expect(context.block).toContain('unknown (general PR/issue comment)');
    expect(context.block).toContain('inline review comment at src/a.ts');
    expect(context.block).toContain('reviewer (inline review comment)');
  });

  it('returns empty discussion after excluding an authenticated bot review comment', () => {
    expect(buildReviewConversationContext([], new Map([[7, [{
      id: 1,
      identity: 'PRRC_1',
      authorLogin: 'bugbot',
      body: 'Bot content',
    }]]]), 'bugbot')).toEqual({ block: '', omitted: 0, truncated: 0, retained: 0 });
  });

  it('keeps the newest 50 discussion items and renders them chronologically', () => {
    const context = buildReviewConversationContext(
      Array.from({ length: 60 }, (_, index) => ({
        id: index,
        user: { login: 'maintainer' },
        body: `body[${String(index).padStart(2, '0')}]`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })),
      new Map(),
    );

    expect(context).toEqual(expect.objectContaining({ retained: 50, omitted: 10 }));
    expect(context.block).not.toContain('body[09]');
    expect(context.block).toContain('body[10]');
    expect(context.block.indexOf('body[10]')).toBeLessThan(context.block.indexOf('body[59]'));
    expect(context.block).toContain('10 older discussion item(s) omitted');
    expect(context.block.length).toBeLessThanOrEqual(24_000);
  });

  it('reports per-item truncation without allowing the diff or discussion blocks past their caps', () => {
    const conversation = buildReviewConversationContext(
      [{ id: 1, user: { login: 'maintainer' }, body: 'x'.repeat(3_000) }],
      new Map(),
    );
    const diff = buildReviewDiffContext({
      prHeadSha: 'sha',
      prFiles: [{ filename: 'src/large.ts', status: 'modified' }],
      pathToFirstDiffLine: {},
      changes: [{
        filename: 'src/large.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: 'x'.repeat(12_001),
      }],
    });

    expect(conversation.truncated).toBe(1);
    expect(conversation.block.length).toBeLessThanOrEqual(24_000);
    expect(diff.truncated).toBe(1);
    expect(diff.block).toContain('[patch truncated]');
    expect(diff.block.length).toBeLessThanOrEqual(64_000);
  });

  it('stops packing discussion when the character budget is reached', () => {
    const context = buildReviewConversationContext(
      Array.from({ length: 20 }, (_, index) => ({
        id: index,
        body: String(index).repeat(3_000),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })),
      new Map(),
    );

    expect(context.retained).toBeLessThan(20);
    expect(context.omitted).toBeGreaterThan(0);
    expect(context.block.length).toBeLessThanOrEqual(24_000);
  });

  it('omits overflowing diff files and exposes the omission in-band', () => {
    const context = buildReviewDiffContext({
      prHeadSha: 'sha',
      prFiles: [],
      pathToFirstDiffLine: {},
      changes: Array.from({ length: 8 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: 'x'.repeat(12_000),
      })),
    });

    expect(context.omitted).toBeGreaterThan(0);
    expect(context.block).toContain('omitted by the prompt budget');
    expect(context.block.length).toBeLessThanOrEqual(64_000);
  });
});
