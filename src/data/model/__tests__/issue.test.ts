import { Issue } from '../issue';

describe('Issue', () => {
  const issuePayload = {
    title: 'Add feature',
    number: 10,
    html_url: 'https://github.com/o/r/issues/10',
    body: 'Body text',
    user: { login: 'bob' },
  };

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

  it('returns empty values when inputs are missing', () => {
    const i = new Issue(false, false, 1, undefined);
    expect(i.title).toBe('');
    expect(i.number).toBe(-1);
    expect(i.isIssue).toBe(false);
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
    const i = new Issue(false, false, 1, { action: 'closed', issue: issuePayload, eventName: 'issues' });
    expect(i.opened).toBe(false);
  });

  it('detects an issue description edit from the GitHub changes payload', () => {
    const i = new Issue(false, false, 1, {
      action: 'edited',
      issue: issuePayload,
      changes: { body: { from: 'Previous description' } },
      eventName: 'issues',
    });

    expect(i.descriptionEdited).toBe(true);
  });

  it('does not treat title-only edits as description edits', () => {
    const i = new Issue(false, false, 1, {
      action: 'edited',
      issue: issuePayload,
      changes: { title: { from: 'Previous title' } },
      eventName: 'issues',
    });

    expect(i.descriptionEdited).toBe(false);
  });

  it('uses the user and comment data provided in inputs', () => {
    const i = new Issue(false, false, 1, {
      action: 'created',
      eventName: 'issue_comment',
      issue: { ...issuePayload, user: { login: 'context-user' } },
      comment: { id: 99, body: 'From context', user: { login: 'ctx-commenter' }, html_url: 'https://comment.url' },
    });
    expect(i.creator).toBe('context-user');
    expect(i.commentBody).toBe('From context');
    expect(i.commentAuthor).toBe('ctx-commenter');
    expect(i.commentUrl).toBe('https://comment.url');
    expect(i.commentId).toBe(99);
  });

  it('uses the label data provided in inputs', () => {
    const i = new Issue(false, false, 1, { action: 'labeled', issue: issuePayload, eventName: 'issues', label: { name: 'from-inputs' } });
    expect(i.labeled).toBe(true);
    expect(i.labelAdded).toBe('from-inputs');
  });
});
