import { ACTIONS, INPUT_KEYS } from '../../../utils/constants';
import { buildDetectPotentialProblemsParams, resolveDetectIssueNumber } from '../detect_potential_problems_policy';

const gitInfo = { owner: 'owner', repo: 'repo' } as const;

describe('detect potential problems policy', () => {
  it('resolves positive issue numbers only', () => {
    expect(resolveDetectIssueNumber('4')).toBe(4);
    expect(resolveDetectIssueNumber('0')).toBeUndefined();
  });

  it('uses the explicit branch before the current branch', () => {
    const params = buildDetectPotentialProblemsParams({ issue: '4', branch: 'bugfix/test' }, gitInfo, 'main');
    expect(params).toMatchObject({
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.DETECT_POTENTIAL_PROBLEMS,
      commits: { ref: 'refs/heads/bugfix/test' },
      issue: { number: 4 },
    });
  });

  it('falls back to the current branch', () => {
    const params = buildDetectPotentialProblemsParams({ issue: '4' }, gitInfo, 'develop');
    expect(params.commits.ref).toBe('refs/heads/develop');
  });
});
