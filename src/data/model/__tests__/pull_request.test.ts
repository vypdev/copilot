import { PullRequest } from '../pull_request';

describe('PullRequest', () => {
  const pr = {
    node_id: 'PR_1',
    title: 'Fix bug',
    number: 42,
    html_url: 'https://github.com/o/r/pull/42',
    body: 'Description',
    head: { ref: 'feature/123-x' },
    base: { ref: 'develop' },
    state: 'open',
    merged: false,
    user: { login: 'alice' },
  };

  it('uses inputs when provided', () => {
    const inputs = {
      action: 'opened',
      pull_request: pr,
      eventName: 'pull_request',
    };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.action).toBe('opened');
    expect(p.id).toBe('PR_1');
    expect(p.title).toBe('Fix bug');
    expect(p.creator).toBe('alice');
    expect(p.number).toBe(42);
    expect(p.url).toBe('https://github.com/o/r/pull/42');
    expect(p.body).toBe('Description');
    expect(p.head).toBe('feature/123-x');
    expect(p.base).toBe('develop');
    expect(p.isMerged).toBe(false);
    expect(p.opened).toBe(true);
    expect(p.isOpened).toBe(true);
    expect(p.isClosed).toBe(false);
    expect(p.isSynchronize).toBe(false);
    expect(p.isPullRequest).toBe(true);
    expect(p.isPullRequestReviewComment).toBe(false);
  });

  it('uses closed and merged data provided in inputs', () => {
    const p = new PullRequest(1, 2, 30, {
      action: 'closed',
      pull_request: { ...pr, state: 'closed', merged: true },
      eventName: 'pull_request',
    });
    expect(p.action).toBe('closed');
    expect(p.isMerged).toBe(true);
    expect(p.isClosed).toBe(true);
    expect(p.isOpened).toBe(false);
  });

  it('isSynchronize when action is synchronize', () => {
    const inputs = { action: 'synchronize', pull_request: pr, eventName: 'pull_request' };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.isSynchronize).toBe(true);
  });

  it('isPullRequestReviewComment when eventName is pull_request_review_comment', () => {
    const inputs = { eventName: 'pull_request_review_comment', pull_request: pr };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.isPullRequestReviewComment).toBe(true);
    expect(p.isPullRequest).toBe(false);
  });

  it('review comment fields from inputs.comment or pull_request_review_comment', () => {
    const inputs = {
      pull_request: pr,
      comment: { id: 99, body: 'LGTM', user: { login: 'bob' }, html_url: 'https://github.com/comment/99' },
    };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.commentId).toBe(99);
    expect(p.commentBody).toBe('LGTM');
    expect(p.commentAuthor).toBe('bob');
    expect(p.commentUrl).toBe('https://github.com/comment/99');
  });

  it('commentInReplyToId returns number when in_reply_to_id present', () => {
    const inputs = {
      pull_request: pr,
      comment: { id: 1, in_reply_to_id: 100 },
    };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.commentInReplyToId).toBe(100);
  });

  it('commentInReplyToId returns undefined when in_reply_to_id absent', () => {
    const inputs = { pull_request: pr, comment: { id: 1 } };
    const p = new PullRequest(1, 2, 30, inputs);
    expect(p.commentInReplyToId).toBeUndefined();
  });
});
