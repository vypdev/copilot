import { isProgressComparisonBranch as safe, selectProgressComparisonSource as select, sameProgressComparisonSource as same } from '../progress_comparison_source_policy';
import type { ProgressComparisonSource, ProgressPullRequestSource } from '../../ports/progress_comparison_source_ports';
const HEAD = 'a'.repeat(40), branch = 'chore/727-maintenance';
const native = (): Extract<ProgressPullRequestSource, { kind: 'pull-request' }> => ({ kind: 'pull-request', number: 172, headSha: HEAD, baseBranch: 'master' });
const read = (source: ProgressPullRequestSource) => select(source, 'develop', branch, HEAD);
describe('authoritative progress comparison source', () => {
    it('uses configured development only after native absence is proven', () => { const value = read({ kind: 'none' }); expect(value).toEqual({ kind: 'development', baseBranch: 'develop' }); expect(Object.isFrozen(value)).toBe(true); });
    it('selects the exact native target and freezes its identity', () => { const value = read(native()); expect(value).toEqual({ kind: 'pull-request', baseBranch: 'master', pullRequestNumber: 172, headSha: HEAD }); expect(Object.isFrozen(value)).toBe(true); });
    it('supports a native release target without inventing a main-branch configuration', () => { expect(read({ ...native(), kind: 'pull-request', baseBranch: 'release/1.0' })).toMatchObject({ baseBranch: 'release/1.0' }); });
    it('never chooses the first of multiple native PRs', () => { expect(() => read({ kind: 'ambiguous' })).toThrow(expect.objectContaining({ code: 'validation.evidence-unavailable' })); });
    it.each(['bad development', 'bad head branch', 'short SHA', 'uppercase SHA'])('rejects %s input', scenario => {
        expect(() => select({ kind: 'none' }, scenario === 'bad development' ? 'bad ref' : 'develop', scenario === 'bad head branch' ? '../bad' : branch, scenario === 'short SHA' ? 'abc' : scenario === 'uppercase SHA' ? HEAD.toUpperCase() : HEAD)).toThrow(expect.objectContaining({ code: 'configuration.invalid' }));
    });
    it.each([0, -1, 1.5, NaN])('rejects invalid PR number %s', number => { expect(() => read({ ...native(), kind: 'pull-request', number })).toThrow(expect.objectContaining({ code: 'workflow.stale' })); });
    it.each(['bad base', 'self base', 'changed head'])('rejects %s native source', scenario => {
        expect(() => read({ ...native(), kind: 'pull-request', baseBranch: scenario === 'bad base' ? 'bad ref' : scenario === 'self base' ? branch : 'master', headSha: scenario === 'changed head' ? 'b'.repeat(40) : HEAD })).toThrow(expect.objectContaining({ code: 'workflow.stale' }));
    });
    it.each(['', '@', '-flag', '.hidden', '/absolute', 'a/', 'a//b', 'a/../b', 'a/./b', 'a..b', 'a.lock', 'a.lock/b', 'a.', 'a@{b', 'a b', 'a\n', 'a\t', 'a\u007f', 'a~', 'a^', 'a:', 'a?', 'a*', 'a[', 'a\\b', 'x'.repeat(256), 42])('rejects unsafe or over-budget native branch %#', value => { expect(safe(value)).toBe(false); });
    it.each(['master', 'develop', 'release/1.0', 'é'.repeat(127), 'x'.repeat(255), 'a@b', 'feature/#727'])('keeps exact safe branch data %#', value => { expect(safe(value)).toBe(true); });
    it('accepts unchanged native and fallback snapshots', () => { const p = read(native()), d = read({ kind: 'none' }); expect(same(p, p)).toBe(true); expect(same(d, d)).toBe(true); });
    it.each(['created', 'closed', 'default retarget', 'native retarget', 'replacement', 'head movement'])('invalidates %s after analysis', scenario => {
        const p = read(native()), d: ProgressComparisonSource = { kind: 'development', baseBranch: 'master' };
        const other: ProgressComparisonSource = scenario === 'native retarget' ? { ...p, baseBranch: 'release/1.0' }
            : scenario === 'replacement' ? { kind: 'pull-request', baseBranch: 'master', pullRequestNumber: 173, headSha: HEAD }
            : scenario === 'head movement' ? { kind: 'pull-request', baseBranch: 'master', pullRequestNumber: 172, headSha: 'b'.repeat(40) }
            : scenario === 'default retarget' ? { kind: 'development', baseBranch: 'elsewhere' } : d;
        expect(same(scenario === 'created' || scenario === 'default retarget' ? d : p, scenario === 'created' ? p : other)).toBe(false);
    });
});
