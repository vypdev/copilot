import { buildCheckProgressParams, buildRecommendStepsParams, parseIssueNumber } from '../issue_command_policy';
import { ACTIONS, INPUT_KEYS } from '../../../utils/constants';

const gitInfo = { owner: 'owner', repo: 'repo' } as const;

describe('issue command policy', () => {
  it('parses only positive issue numbers', () => {
    expect(parseIssueNumber('12')).toBe(12);
    expect(parseIssueNumber('0')).toBeUndefined();
    expect(parseIssueNumber('abc')).toBeUndefined();
  });

  it('builds check-progress params with an optional branch reference', () => {
    const params = buildCheckProgressParams({ issue: '12', branch: 'feature/test', debug: true }, gitInfo);
    if (!params) throw new Error('Expected valid check-progress parameters.');
    expect(params).toMatchObject({
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.CHECK_PROGRESS,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 12,
      issue: { number: 12 },
      commits: { ref: 'refs/heads/feature/test' },
    });
  });

  it('builds recommend-steps params without branch state', () => {
    const params = buildRecommendStepsParams({ issue: '8' }, gitInfo);
    if (!params) throw new Error('Expected valid recommend-steps parameters.');
    expect(params).toMatchObject({ [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.RECOMMEND_STEPS, [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 8, issue: { number: 8 } });
    expect(params.commits).toBeUndefined();
  });
});
