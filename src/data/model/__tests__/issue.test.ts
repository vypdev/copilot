import * as github from '@actions/github';
import { Issue } from '../issue';

jest.mock('@actions/github', () => ({
  context: {
    payload: {} as Record<string, unknown>,
    eventName: '',
  },
}));

function getContext(): { payload: Record<string, unknown>; eventName: string } {
  return github.context as unknown as { payload: Record<string, unknown>; eventName: string };
}

describe('Issue', () => {
  const issuePayload = {
    title: 'Add feature',
    number: 10,
    html_url: 'https://github.com/o/r/issues/10',
    body: 'Body text',
    user: { login: 'bob' },
  };

  beforeEach(() => {
    getContext().payload = {};
    getContext().eventName = 'issues';
  });

  it('uses inputs when provided', () => {
    const inputs = { action: 'opened', issue: issuePayload, eventName: 'issues' };
    const i = new Issue(false, false, 1, inputs);
    expect(i.title).toBe('Add feature');
    expect(i.number).toBe(10);
    expect(i.creator).toBe('bob');
    expect(i.url).toBe('https://github.com/o/r/issues/10');
    expect(i.body).toBe('Body text');
    expect(i.opened).toBe(true);
    expect(i.labeled).toBe(false);
    expect(i.isIssue).toBe(true);
    expect(i.isIssueComment).toBe(false);
  });

  it('falls back to context.payload when inputs missing', () => {
    getContext().payload = {
      action: 'opened',
      issue: issuePayload,
    };
    getContext().eventName = 'issues';
    const i = new Issue(false, false, 1, undefined);
    expect(i.title).toBe('Add feature');
    expect(i.number).toBe(10);
    expect(i.isIssue).toBe(true);
  });

  it('labeled and labelAdded when action is labeled', () => {
    const inputs = { action: 'labeled', issue: issuePayload, label: { name: 'bug' } };
    const i = new Issue(false, false, 1, inputs);
    expect(i.labeled).toBe(true);
    expect(i.labelAdded).toBe('bug');
  });

  it('isIssueComment when eventName is issue_comment', () => {
    const inputs = { eventName: 'issue_comment', issue: issuePayload, comment: { id: 5, body: 'Hi', user: { login: 'alice' }, html_url: 'url' } };
    const i = new Issue(false, false, 1, inputs);
    expect(i.isIssueComment).toBe(true);
    expect(i.isIssue).toBe(false);
    expect(i.commentId).toBe(5);
    expect(i.commentBody).toBe('Hi');
    expect(i.commentAuthor).toBe('alice');
    expect(i.commentUrl).toBe('url');
  });

  it('opened is true when action is reopened', () => {
    const inputs = { action: 'reopened', issue: issuePayload, eventName: 'issues' };
    const i = new Issue(false, false, 1, inputs);
    expect(i.opened).toBe(true);
  });

  it('opened is false when action is closed', () => {
    getContext().payload = { action: 'closed', issue: issuePayload };
    const i = new Issue(false, false, 1, undefined);
    expect(i.opened).toBe(false);
  });

  it('falls back to context for creator when inputs.issue has no user', () => {
    getContext().payload = { action: 'opened', issue: { ...issuePayload, user: { login: 'context-user' } } };
    const i = new Issue(false, false, 1, { action: 'opened', issue: { title: 'x', number: 1, body: '', html_url: '' }, eventName: 'issues' });
    expect(i.creator).toBe('context-user');
    const i2 = new Issue(false, false, 1, undefined);
    expect(i2.creator).toBe('context-user');
  });

  it('falls back to context for commentBody and commentAuthor when inputs has eventName but comment from context', () => {
    getContext().payload = {
      action: 'created',
      issue: issuePayload,
      comment: { id: 99, body: 'From context', user: { login: 'ctx-commenter' }, html_url: 'https://comment.url' },
    };
    getContext().eventName = 'issue_comment';
    const i = new Issue(false, false, 1, { eventName: 'issue_comment', issue: issuePayload });
    expect(i.commentBody).toBe('From context');
    expect(i.commentAuthor).toBe('ctx-commenter');
    expect(i.commentUrl).toBe('https://comment.url');
    expect(i.commentId).toBe(99);
  });

  it('labelAdded falls back to context when inputs has labeled but no label', () => {
    getContext().payload = { action: 'labeled', issue: issuePayload, label: { name: 'from-ctx' } };
    const i = new Issue(false, false, 1, undefined);
    expect(i.labeled).toBe(true);
    expect(i.labelAdded).toBe('from-ctx');
  });
});
