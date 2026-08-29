import {
  buildReviewerExclusions,
  calculateReviewersStillNeeded,
  selectConfirmedReviewers,
  selectEligibleReviewers,
  uniqueLogins,
} from '../reviewer_assignment_policy';

describe('reviewer assignment policy', () => {
  it('deduplicates logins without losing the first display casing', () => {
    expect(uniqueLogins(['Alice', 'alice', 'Bob'])).toEqual(['Alice', 'Bob']);
  });

  it('builds exclusions from the creator, reviewers, and assignees', () => {
    expect(buildReviewerExclusions('author', ['reviewer'], ['assignee']))
      .toEqual(['author', 'reviewer', 'assignee']);
  });

  it('selects unique eligible members up to the requested count', () => {
    expect(selectEligibleReviewers(
      ['author', 'Alice', 'alice', 'Bob'],
      ['AUTHOR'],
      1,
    )).toEqual(['Alice']);
  });

  it('accepts only requested confirmations and ignores case-insensitive duplicates', () => {
    expect(selectConfirmedReviewers(['Alice', 'Bob'], ['ALICE', 'alice', 'other', 'BOB']))
      .toEqual(['ALICE', 'BOB']);
  });

  it('never reports a negative reviewer deficit', () => {
    expect(calculateReviewersStillNeeded(2, 1, 3)).toBe(0);
    expect(calculateReviewersStillNeeded(3, 1, 1)).toBe(1);
  });
});
