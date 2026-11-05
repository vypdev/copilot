import * as actionsExec from '@actions/exec';
import { GitCommitAdapter } from '../git_commit_adapter';
import { captureGitPushDiagnostic, GIT_PUSH_DIAGNOSTIC_BYTES } from '../git_push_diagnostic';
import { GitPushFailure } from '../../domain/git_push_failure';
const denial = 'remote: refusing to allow a Personal Access Token to create or update workflow `.github/workflows/ci_check.yml` without `workflow` scope';
describe('Bounded trusted Git push diagnostic', () => {
  it.each([
    denial,
    'remote: refusing to allow an OAuth App to update workflow ci.yml without workflow scope',
    'remote: refusing to allow a GitHub App to create workflow ci.yml without workflows permission',
  ])('recognizes only an explicit remote workflow capability denial: %s', text => {
    const capture = captureGitPushDiagnostic(); capture.stderr(Buffer.from(text)); expect(capture.classify()).toBe('workflow-write-required');
  });
  it('reassembles a denial across stderr chunks and retains it after a large prefix', () => {
    const capture = captureGitPushDiagnostic(); capture.stderr(Buffer.alloc(GIT_PUSH_DIAGNOSTIC_BYTES * 4, 120));
    for (const part of [denial.slice(0, 73), denial.slice(73, 109), denial.slice(109)]) capture.stderr(Buffer.from(part));
    expect(capture.classify()).toBe('workflow-write-required');
    capture.stderr(Buffer.alloc(GIT_PUSH_DIAGNOSTIC_BYTES + 1, 120)); expect(capture.classify()).toBe('unclassified');
  });
  it.each(['', 'Permission denied', '.github/workflows/ci_check.yml', 'workflow scope required', 'refusing to allow a Personal Access Token to update workflow x\nwithout workflow scope', 'refusing to allow a user to update workflow x without workflow scope'])('does not invent capability facts from %p', text => {
    const capture = captureGitPushDiagnostic(); capture.stderr(Buffer.from(text)); expect(capture.classify()).toBe('unclassified');
  });
  it.each(['nonzero', 'exception', 'generic', 'success'] as const)('maps push outcome %s without leaking raw output', async outcome => {
    const execute = jest.fn(async (_program: string, _args: string[], options?: { stderr?: (data: Buffer) => void; env?: Record<string, string> }) => {
      options?.stderr?.(Buffer.from(outcome === 'generic' ? 'PRIVATE credential or path' : denial));
      if (outcome === 'exception' || outcome === 'generic') throw new Error('PRIVATE exception or token');
      return outcome === 'nonzero' ? 1 : 0;
    });
    const push = new GitCommitAdapter(execute).push('feature/42', 'fixture-not-real');
    if (outcome === 'success') await expect(push).resolves.toBeUndefined();
    else {
      const error = await push.catch(e => e);
      expect(error).toBeInstanceOf(GitPushFailure);
      expect(error.reason).toBe(outcome === 'generic' ? 'unclassified' : 'workflow-write-required');
      expect(error.message).not.toMatch(/PRIVATE|ci_check|fixture-not-real/);
    }
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][1]).toEqual(['push', 'origin', 'feature/42']);
    expect(execute.mock.calls[0][2]?.env?.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
  });
  it('rejects a nonthrowing failed fetch instead of treating a stale FETCH_HEAD as an observation', async () => {
    await expect(new GitCommitAdapter(async () => 1).fetch('feature/42')).rejects.toThrow('Git fetch did not complete');
  });
  it('captures default-executor stderr silently, without publishing it in Actions logs', async () => {
    const native = jest.spyOn(actionsExec, 'exec').mockImplementation(async (_program, _args, options) => {
      expect(options?.silent).toBe(true); options?.listeners?.stderr?.(Buffer.from(denial)); throw Error('PRIVATE');
    });
    try { await expect(new GitCommitAdapter().push('feature/42')).rejects.toMatchObject({ reason: 'workflow-write-required' }); }
    finally { native.mockRestore(); }
  });
});
