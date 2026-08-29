import {
  calculateRemainingAssignees,
  resolveAssigneeTarget,
  resolveCreatorAssignment,
  selectConfirmedAssignees,
} from '../assignee_assignment_policy';

const context = {
  isIssue: true,
  isPullRequest: true,
  issue: { number: 42, desiredAssigneesCount: 2, creator: 'Alice' },
  pullRequest: { number: 99, desiredAssigneesCount: 1, creator: 'Bob' },
};

describe('assignee assignment policy', () => {
  it('resolves the issue target when the event is an issue', () => {
    expect(resolveAssigneeTarget(context)).toEqual({ number: 42, desiredCount: 2 });
    expect(resolveAssigneeTarget({ ...context, isIssue: false })).toEqual({ number: 99, desiredCount: 1 });
  });

  it('prioritizes an eligible pull request creator and matches identities case-insensitively', () => {
    expect(resolveCreatorAssignment(context, ['bob', 'alice'], [])).toEqual({ login: 'Bob', source: 'pull request' });
    expect(resolveCreatorAssignment(context, ['alice'], ['ALICE'])).toBeUndefined();
  });

  it('does not select an issue creator for a pull request context', () => {
    expect(resolveCreatorAssignment({ ...context, isIssue: false, isPullRequest: false, pullRequest: { ...context.pullRequest, creator: '' } }, ['Alice'], []))
      .toBeUndefined();
  });

  it('calculates remaining assignees after optional creator assignment', () => {
    expect(calculateRemainingAssignees(3, 1, true)).toBe(1);
    expect(calculateRemainingAssignees(1, 1, false)).toBe(0);
  });

  it('matches provider confirmations case-insensitively', () => {
    expect(selectConfirmedAssignees(['alice', 'bob'], ['ALICE', 'other', 'Bob']))
      .toEqual(['ALICE', 'Bob']);
  });
});
