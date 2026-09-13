import { buildCommitPrefix } from '../execute_script_use_case';

describe('buildCommitPrefix', () => {
  it.each([
    ['feature/123-add-login', 'replace-slash', 'feature-123-add-login'],
    ['Feature/Branch_Name', 'replace-slash,kebab-case', 'feature-branch-name'],
    ['FEATURE/ABC', 'replace-slash,lowercase', 'feature-abc'],
    ['feature/abc', 'replace-slash,uppercase', 'FEATURE-ABC'],
    ['Feature Branch Name', 'kebab-case', 'feature-branch-name'],
    ['Feature Branch', 'snake-case', 'feature_branch'],
    ['  branch  ', 'trim', 'branch'],
    ['feature/branch_name', 'replace-all', 'feature-branch-name'],
    ['feature-branch-name', 'camel-case', 'featureBranchName'],
    ['feature123', 'remove-numbers', 'feature'],
    ['feat@ure!', 'remove-special', 'feature'],
    ['f e a t', 'remove-spaces', 'feat'],
    ['a-b-c', 'remove-dashes', 'abc'],
    ['a_b_c', 'remove-underscores', 'abc'],
    ['--a--b--', 'clean-dashes', 'a-b'],
    ['__a__b__', 'clean-underscores', 'a_b'],
    ['branch', 'prefix', 'prefix-branch'],
    ['branch', 'suffix', 'branch-suffix'],
    ['single', 'camel-case', 'single'],
  ])('transforms %s with %s', (branch, transforms, expected) => {
    expect(buildCommitPrefix(branch, transforms)).toBe(expected);
  });

  it('keeps the current value and reports an unknown transform', () => {
    const onUnknown = jest.fn();

    expect(buildCommitPrefix('branch', 'unknown-transform', onUnknown)).toBe('branch');
    expect(onUnknown).toHaveBeenCalledWith('unknown-transform');
  });

  it('throws when the branch is absent instead of manufacturing a prefix', () => {
    expect(() => buildCommitPrefix(undefined as unknown as string, 'lowercase')).toThrow();
  });
});
