import { buildReviewConversationBlock, buildReviewDiffBlock } from '../bugbot_review_context';

describe('Bugbot review context', () => {
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
});
