import { CloseIssueAfterMergingUseCase } from '../../steps/issue/close_issue_after_merging_use_case';
import { ReconcileClosedIssueMetadataUseCase } from '../reconcile_closed_issue_metadata_use_case';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import type { NativeIssueCompletionFacts } from '../../../../domain/issue_completion';

const configuration = { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: ['branched', 'SDD', 'contract-change'] };
function fixture(reason: NativeIssueCompletionFacts['reason'] = 'completed') {
    const labels = new Set(['help', 'in-progress', 'state:working', '55%', 'branched', 'SDD', 'external']);
    const facts: { number: number; state: NativeIssueCompletionFacts['state']; reason: NativeIssueCompletionFacts['reason'] } = { number: 42, state: 'closed', reason };
    const target = { read: jest.fn(async () => ({ ...facts, labels: [...labels] })),
        removeLabel: jest.fn(async (label: string) => { labels.delete(label); }),
        addLabel: jest.fn(async (label: string) => { labels.add(label); }) };
    const port = { forIssue: jest.fn(() => target) };
    const context = { issueNumber: 42, completionLabels: configuration };
    const useCase = new ReconcileClosedIssueMetadataUseCase(port);
    return { labels, facts, target, port, context, run: () => useCase.invoke(context) };
}

describe('guarded native-close metadata repair', () => {
    it('defers progress and lifecycle cleanup for a pending deployment despite native closure', async () => {
        const f = fixture(); const facts = await f.target.read();
        f.target.read.mockResolvedValue({ ...facts, deploymentCompletion: 'pending' } as never);
        expect((await f.run())[0]).toMatchObject({ success: true, executed: false,
            payload: { issueCompletion: { nativeClosed: true, deploymentCompletion: 'pending', outcome: 'deferred' } } });
        expect(f.target.addLabel).not.toHaveBeenCalled(); expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('does not close a pending launcher after a generic merged PR', async () => {
        const f = fixture(); const close = jest.fn();
        f.target.read.mockResolvedValue({ number: 42, state: 'open', reason: 'unknown', labels: ['55%'], deploymentCompletion: 'pending' } as never);
        const useCase = new CloseIssueAfterMergingUseCase({ forIssue: () => ({ ...f.target, close }),
            readPullRequest: async () => ({ number: 10, state: 'closed', merged: true }) });
        expect((await useCase.invoke({ issueNumber: 42, pullRequestNumber: 10, completionLabels: configuration }))[0])
            .toMatchObject({ success: true, executed: false, payload: { issueCompletion: { outcome: 'deferred', nativeClosed: false } } });
        expect(close).not.toHaveBeenCalled(); expect(f.target.addLabel).not.toHaveBeenCalled();
    });
    it.each(['completed', 'not_planned', 'duplicate', 'unknown'] as const)('repairs %s closure without changing native state or historical labels', async reason => {
        const f = fixture(reason); const [result] = await f.run();
        expect(result).toMatchObject({ success: true, executed: true, payload: { issueCompletion: { nativeClosed: true, reconciled: true, reason } } });
        expect([...f.labels]).toEqual(['help', 'branched', 'SDD', 'external', ...(reason === 'completed' ? ['100%'] : [])]);
        expect(f.target.read.mock.calls.length).toBeGreaterThanOrEqual(f.target.removeLabel.mock.calls.length + f.target.addLabel.mock.calls.length + 2);
    });
    it('is a no-write replay after verified repair', async () => {
        const f = fixture(); await f.run(); f.target.removeLabel.mockClear(); f.target.addLabel.mockClear();
        const [result] = await f.run();
        expect(result).toMatchObject({ success: true, executed: false });
        expect(f.target.removeLabel).not.toHaveBeenCalled(); expect(f.target.addLabel).not.toHaveBeenCalled();
    });
    it.each([0, Number.NaN])('rejects unsafe issue %s before obtaining authority', async number => {
        const f = fixture(); f.context.issueNumber = number;
        expect((await f.run())[0].success).toBe(false); expect(f.port.forIssue).not.toHaveBeenCalled();
    });
    it.each(['open', 'foreign', 'invalid-reason'])('refuses %s native evidence before writes', async kind => {
        const f = fixture();
        if (kind === 'open') { f.facts.state = 'open'; f.facts.reason = 'reopened'; }
        if (kind === 'foreign') f.facts.number = 99;
        if (kind === 'invalid-reason') f.facts.reason = 'reopened';
        expect((await f.run())[0].success).toBe(false);
        expect(f.target.removeLabel).not.toHaveBeenCalled(); expect(f.target.addLabel).not.toHaveBeenCalled();
    });
    it('retains the existing issue and labels when the initial native read fails', async () => {
        const f = fixture(); f.target.read.mockRejectedValue(new Error('403 forbidden'));
        expect((await f.run())[0]).toMatchObject({ success: false, executed: false });
        expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('reports a failed removal without inventing completion', async () => {
        const f = fixture(); f.target.removeLabel.mockRejectedValue(new Error('denied'));
        expect((await f.run())[0]).toMatchObject({ success: false, executed: false, payload: { issueCompletion: { reconciled: false } } });
        expect(f.target.addLabel).not.toHaveBeenCalled();
    });
    it('retains completed removals when adding completion progress fails', async () => {
        const f = fixture(); f.target.addLabel.mockRejectedValue(new Error('denied'));
        expect((await f.run())[0]).toMatchObject({ success: false, executed: true, payload: { issueCompletion: { labelsChanged: 3, nativeClosed: true } } });
        expect(f.labels.has('state:working')).toBe(false); expect(f.labels.has('100%')).toBe(false);
    });
    it('stops if the issue reopens before the first label write', async () => {
        const f = fixture(); const read = f.target.read.getMockImplementation()!; let calls = 0;
        f.target.read.mockImplementation(async () => { if (++calls === 2) { f.facts.state = 'open'; f.facts.reason = 'reopened'; } return read(); });
        expect((await f.run())[0].success).toBe(false); expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('stops on a changed closure reason before a label write', async () => {
        const f = fixture(); const read = f.target.read.getMockImplementation()!; let calls = 0;
        f.target.read.mockImplementation(async () => { if (++calls === 2) f.facts.reason = 'not_planned'; return read(); });
        expect((await f.run())[0].success).toBe(false); expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('does not claim repair when the provider omits native identity', async () => {
        const f = fixture(); f.target.read.mockResolvedValue(undefined as never);
        expect((await f.run())[0].success).toBe(false); expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('skips a label removed by another actor before its write fence', async () => {
        const f = fixture(); const read = f.target.read.getMockImplementation()!; let calls = 0;
        f.target.read.mockImplementation(async () => { if (++calls === 2) f.labels.delete('in-progress'); return read(); });
        expect((await f.run())[0].success).toBe(true); expect(f.target.removeLabel).not.toHaveBeenCalledWith('in-progress');
    });
    it('preserves an unrelated label added concurrently', async () => {
        const f = fixture(); const remove = f.target.removeLabel.getMockImplementation()!;
        f.target.removeLabel.mockImplementation(async label => { await remove(label); f.labels.add('human-label'); });
        expect((await f.run())[0].success).toBe(true); expect(f.labels.has('human-label')).toBe(true);
    });
    it('repairs a concurrently added managed label in the second bounded pass', async () => {
        const f = fixture(); const add = f.target.addLabel.getMockImplementation()!;
        f.target.addLabel.mockImplementation(async label => { await add(label); f.labels.add('state:planned'); });
        expect((await f.run())[0]).toMatchObject({ success: true, executed: true, payload: { issueCompletion: { superseded: true } } });
        expect(f.labels.has('100%')).toBe(true); expect(f.labels.has('state:planned')).toBe(false);
    });
    it('refuses a managed/protected configuration conflict before mutation', async () => {
        const f = fixture(); f.context.completionLabels = { ...configuration, protectedLabels: ['in-progress'] };
        expect((await f.run())[0].success).toBe(false); expect(f.target.removeLabel).not.toHaveBeenCalled();
    });
    it('retains an earlier removal when reopening occurs between mutations', async () => {
        const f = fixture(); const remove = f.target.removeLabel.getMockImplementation()!;
        f.target.removeLabel.mockImplementation(async label => { await remove(label); f.facts.state = 'open'; f.facts.reason = 'reopened'; });
        expect((await f.run())[0]).toMatchObject({ success: false, executed: true, payload: { issueCompletion: { labelsChanged: 1, nativeClosed: false } } });
        expect(f.target.removeLabel).toHaveBeenCalledTimes(1); expect(f.target.addLabel).not.toHaveBeenCalled();
    });
});


describe('bounded concurrent completion convergence (#622)', () => {
    it('adopts a removal completed between its fresh fence and the provider write', async () => {
        const f = fixture(); const remove = f.target.removeLabel.getMockImplementation()!;
        f.target.removeLabel.mockImplementationOnce(async label => { await remove(label); throw new Error('404 SECRET'); });
        expect((await f.run())[0]).toMatchObject({ success: true, payload: { issueCompletion: { reconciled: true, superseded: true } } });
        expect([...f.labels]).toContain('100%');
    });
    it('adopts an applied addition whose transport response was lost', async () => {
        const f = fixture(); f.target.addLabel.mockImplementation(async label => { f.labels.add(label); throw new Error('SECRET'); });
        expect((await f.run())[0]).toMatchObject({ success: true, payload: { issueCompletion: { superseded: true } } });
    });
    it('stops after two passes when managed metadata keeps changing', async () => {
        const f = fixture(); const remove = f.target.removeLabel.getMockImplementation()!;
        f.target.removeLabel.mockImplementation(async label => { await remove(label); f.labels.add('state:blocked'); });
        const [result] = await f.run();
        expect(result).toMatchObject({ success: false, errors: [{ code: 'provider.conflict', retryable: true,
            recovery: { variables: { resultId: 'ReconcileClosedIssueMetadataUseCase', phase: 'metadata-verification', state: 'closed', reason: 'completed', remaining: 1 } } }] });
        expect(f.target.removeLabel).toHaveBeenCalledTimes(4);
    });
    it('converges real concurrent closed-event and merged-PR delivery without suppressing errors globally', async () => {
        const f = fixture();
        f.target.removeLabel.mockImplementation(async label => { if (!f.labels.delete(label)) throw new Error('404 missing label'); });
        const merged = new CloseIssueAfterMergingUseCase({ forIssue: () => ({ ...f.target, close: jest.fn(async () => false) }),
            readPullRequest: async () => ({ number: 43, state: 'closed', merged: true }) });
        const [closedResults, mergedResults] = await Promise.all([f.run(), merged.invoke({ issueNumber: 42, pullRequestNumber: 43,
            completionLabels: configuration })]);
        expect([...closedResults, ...mergedResults].every(result => result.success)).toBe(true);
        expect([...f.labels]).toEqual(['help', 'branched', 'SDD', 'external', '100%']);
    });
    it.each(['reopened', 'not_planned'] as const)('stops after a failed write exposes reason %s', async reason => {
        const f = fixture(); f.target.removeLabel.mockImplementation(async label => {
            f.labels.delete(label); f.facts.reason = reason; if (reason === 'reopened') f.facts.state = 'open';
            throw new Error('SECRET');
        });
        const [result] = await f.run();
        expect(result).toMatchObject({ success: false, errors: [{ code: 'workflow.stale', recovery: { variables: { reason } } }] });
        expect(f.target.removeLabel).toHaveBeenCalledTimes(1); expect(f.target.addLabel).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain('SECRET');
    });
    it('identifies a no-write duplicate only after fresh metadata verification', async () => {
        const f = fixture(); await f.run(); f.target.read.mockClear();
        expect((await f.run())[0]).toMatchObject({ success: true, executed: false,
            payload: { issueCompletion: { outcome: 'already-converged', nativeClosed: true, reason: 'completed' } } });
        expect(f.target.read).toHaveBeenCalledTimes(2);
    });
});
