import { CommitPrefixBuilderUseCase } from '../execute_script_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

describe('CommitPrefixBuilderUseCase (execute_script)', () => {
  let useCase: CommitPrefixBuilderUseCase;

  beforeEach(() => {
    useCase = new CommitPrefixBuilderUseCase();
  });

  const param = (branchName: string, commitPrefixBuilder: string) =>
    ({
      commitPrefixBuilderParams: { branchName },
      commitPrefixBuilder,
    } as unknown as Parameters<CommitPrefixBuilderUseCase['invoke']>[0]);

  it('returns success with scriptResult when transforms are applied', async () => {
    const results = await useCase.invoke(param('feature/123-add-login', 'replace-slash'));

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].payload?.scriptResult).toBe('feature-123-add-login');
  });

  it('applies multiple transforms in order', async () => {
    const results = await useCase.invoke(param('Feature/Branch_Name', 'replace-slash,kebab-case'));

    expect(results[0].payload?.scriptResult).toBe('feature-branch-name');
  });

  it('applies lowercase transform', async () => {
    const results = await useCase.invoke(param('FEATURE/ABC', 'replace-slash,lowercase'));

    expect(results[0].payload?.scriptResult).toBe('feature-abc');
  });

  it('applies uppercase transform', async () => {
    const results = await useCase.invoke(param('feature/abc', 'replace-slash,uppercase'));

    expect(results[0].payload?.scriptResult).toBe('FEATURE-ABC');
  });

  it('applies kebab-case transform', async () => {
    const results = await useCase.invoke(param('Feature Branch Name', 'kebab-case'));

    expect(results[0].payload?.scriptResult).toBe('feature-branch-name');
  });

  it('applies snake_case transform', async () => {
    const results = await useCase.invoke(param('Feature Branch', 'snake-case'));

    expect(results[0].payload?.scriptResult).toBe('feature_branch');
  });

  it('applies trim transform', async () => {
    const results = await useCase.invoke(param('  branch  ', 'trim'));

    expect(results[0].payload?.scriptResult).toBe('branch');
  });

  it('applies replace-all transform', async () => {
    const results = await useCase.invoke(param('feature/branch_name', 'replace-all'));

    expect(results[0].payload?.scriptResult).toBe('feature-branch-name');
  });

  it('returns failure when branchName is missing and throws', async () => {
    const results = await useCase.invoke(
      param(undefined as unknown as string, 'lowercase')
    );

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
  });

  it('applies camel-case transform', async () => {
    const results = await useCase.invoke(param('feature-branch-name', 'camel-case'));

    expect(results[0].payload?.scriptResult).toBe('featureBranchName');
  });

  it('applies remove-numbers transform', async () => {
    const results = await useCase.invoke(param('feature123', 'remove-numbers'));

    expect(results[0].payload?.scriptResult).toBe('feature');
  });

  it('applies remove-special transform', async () => {
    const results = await useCase.invoke(param('feat@ure!', 'remove-special'));

    expect(results[0].payload?.scriptResult).toBe('feature');
  });

  it('applies remove-spaces transform', async () => {
    const results = await useCase.invoke(param('f e a t', 'remove-spaces'));

    expect(results[0].payload?.scriptResult).toBe('feat');
  });

  it('applies remove-dashes and remove-underscores transforms', async () => {
    const results = await useCase.invoke(param('a-b-c', 'remove-dashes'));
    expect(results[0].payload?.scriptResult).toBe('abc');

    const results2 = await useCase.invoke(param('a_b_c', 'remove-underscores'));
    expect(results2[0].payload?.scriptResult).toBe('abc');
  });

  it('applies clean-dashes and clean-underscores transforms', async () => {
    const results = await useCase.invoke(param('--a--b--', 'clean-dashes'));
    expect(results[0].payload?.scriptResult).toBe('a-b');

    const results2 = await useCase.invoke(param('__a__b__', 'clean-underscores'));
    expect(results2[0].payload?.scriptResult).toBe('a_b');
  });

  it('applies prefix and suffix transforms', async () => {
    const results = await useCase.invoke(param('branch', 'prefix'));
    expect(results[0].payload?.scriptResult).toBe('prefix-branch');

    const results2 = await useCase.invoke(param('branch', 'suffix'));
    expect(results2[0].payload?.scriptResult).toBe('branch-suffix');
  });

  it('returns input unchanged for unknown transform', async () => {
    const { logDebugInfo } = require('../../../../../utils/logger');
    const results = await useCase.invoke(param('branch', 'unknown-transform'));

    expect(results[0].payload?.scriptResult).toBe('branch');
    expect(logDebugInfo).toHaveBeenCalledWith(expect.stringContaining('Unknown transform'));
  });

  it('applies camel-case with single word (index 0 only)', async () => {
    const results = await useCase.invoke(param('single', 'camel-case'));

    expect(results[0].payload?.scriptResult).toBe('single');
  });
});
