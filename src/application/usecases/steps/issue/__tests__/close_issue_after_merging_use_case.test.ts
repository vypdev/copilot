import { CloseIssueAfterMergingUseCase } from '../close_issue_after_merging_use_case';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../../domain/copilot_lifecycle';
import type { NativeIssueCompletionFacts } from '../../../../../domain/issue_completion';

const configuration = { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: ['bugfix', 'branched', 'SDD'] };
function fixture(open = false, initialLabels = ['in-progress', 'state:working', '55%', 'bugfix', 'branched', 'SDD', 'external']) {
    let state: NativeIssueCompletionFacts['state'] = open ? 'open' : 'closed';
    let reason: NativeIssueCompletionFacts['reason'] = 'completed';
    const labels = new Set(initialLabels);
    const read = jest.fn(async (): Promise<NativeIssueCompletionFacts> => ({ number: 42, state, reason, labels: [...labels] }));
    const close = jest.fn(async () => { state = 'closed'; reason = 'completed'; return true; });
    const addLabel = jest.fn(async (label: string) => { labels.add(label); });
    const removeLabel = jest.fn(async (label: string) => { labels.delete(label); });
    const target = Object.freeze({ read, close, addLabel, removeLabel });
    const port = Object.freeze({ forIssue: jest.fn((_number: number) => target), readPullRequest: jest.fn(async () => ({ number: 10, state: 'closed' as const, merged: true })) });
    const param = { issueNumber: 42, pullRequestNumber: 10, completionLabels: configuration };
    return { param, port, read, close, addLabel, removeLabel, labels,
        setState: (next: NativeIssueCompletionFacts['state']) => { state = next; },
        setReason: (next: NativeIssueCompletionFacts['reason']) => { reason = next; },
        invoke: () => new CloseIssueAfterMergingUseCase(port).invoke(param) };
}

describe('CloseIssueAfterMergingUseCase', () => {
    it('closes the issue using native state without adding a timeline comment', async () => {
        const f = fixture(true); const [result] = await f.invoke();
        expect(result).toMatchObject({ success: true, executed: true });
        expect(f.port.forIssue).toHaveBeenCalledWith(42);
        expect(f.close).toHaveBeenCalledWith();
        expect([...f.labels]).toEqual(['bugfix', 'branched', 'SDD', 'external', '100%']);
        expect(Object.keys(f.port.forIssue(42))).toEqual(['read', 'close', 'addLabel', 'removeLabel']);
    });
    it('does not claim completion when a false close return leaves the issue open', async () => {
        const f = fixture(true); f.close.mockImplementation(async () => false);
        expect((await f.invoke())[0]).toMatchObject({ success: false, executed: false });
        expect(f.addLabel).not.toHaveBeenCalled(); expect(f.removeLabel).not.toHaveBeenCalled();
    });
    it.each([-1, 10, Number.MAX_SAFE_INTEGER + 1, Number.NaN])('does not call GitHub without a separate safe linked issue: %s', async issueNumber => {
        const f = fixture();
        const [result] = await new CloseIssueAfterMergingUseCase(f.port).invoke({ ...f.param, issueNumber });
        expect(result).toMatchObject({ success: true, executed: false });
        expect(f.port.readPullRequest).not.toHaveBeenCalled(); expect(f.port.forIssue).not.toHaveBeenCalled();
    });
    it('returns failure when the native close request throws', async () => {
        const f = fixture(true); f.close.mockRejectedValue(new Error('API unavailable'));
        expect((await f.invoke())[0]).toMatchObject({ success: false });
        expect(f.removeLabel).not.toHaveBeenCalled();
    });
    it('repairs already-closed metadata without repeating native closure', async () => {
        const f = fixture(); const [result] = await f.invoke();
        expect(result).toMatchObject({ success: true, executed: true, payload: { issueCompletion: { nativeClosed: true, closedThisRun: false, reconciled: true } } });
        expect(f.close).not.toHaveBeenCalled();
    });
    it('is a no-op when replay observes completed metadata', async () => {
        const f = fixture(false, ['100%', 'SDD', 'external']);
        expect((await f.invoke())[0]).toMatchObject({ success: true, executed: false });
        expect(f.close).not.toHaveBeenCalled(); expect(f.removeLabel).not.toHaveBeenCalled(); expect(f.addLabel).not.toHaveBeenCalled();
    });
    it.each(['not_planned', 'unknown'] as const)('clears stale labels without inventing 100%% for reason %s', async reason => {
        const f = fixture(false, ['in-progress', '100%', 'external']); f.setReason(reason);
        expect((await f.invoke())[0].success).toBe(true); expect([...f.labels]).toEqual(['external']);
        expect(f.addLabel).not.toHaveBeenCalled();
    });
    it.each([0, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe PR identity %s before provider reads', async pullRequestNumber => {
        const f = fixture(); await new CloseIssueAfterMergingUseCase(f.port).invoke({ ...f.param, pullRequestNumber });
        expect(f.port.readPullRequest).not.toHaveBeenCalled();
    });
    it.each(['open', 'unmerged', 'foreign'] as const)('rejects current PR evidence that is %s', async value => {
        const f = fixture(); f.port.readPullRequest.mockResolvedValue({ number: value === 'foreign' ? 11 : 10,
            state: value === 'open' ? 'open' as never : 'closed', merged: value !== 'unmerged' });
        expect((await f.invoke())[0].success).toBe(false); expect(f.port.forIssue).not.toHaveBeenCalled();
    });
    it('rejects a foreign issue returned by the target capability', async () => {
        const f = fixture(); f.read.mockResolvedValue({ number: 43, state: 'closed', reason: 'completed', labels: [] });
        expect((await f.invoke())[0].success).toBe(false); expect(f.addLabel).not.toHaveBeenCalled();
    });
    it('rejects invalid managed/protected configuration before any write', async () => {
        const f = fixture();
        const [result] = await new CloseIssueAfterMergingUseCase(f.port).invoke({ ...f.param,
            completionLabels: { ...configuration, protectedLabels: ['state:working'] } });
        expect(result.success).toBe(false); expect(f.close).not.toHaveBeenCalled(); expect(f.removeLabel).not.toHaveBeenCalled();
    });
    it('keeps provider read failure distinct from native closure', async () => {
        const f = fixture(); f.read.mockRejectedValue(new Error('denied'));
        expect((await f.invoke())[0]).toMatchObject({ success: false, executed: false, payload: { issueCompletion: { nativeClosed: false } } });
    });
    it('retains verified native closure when a label removal fails', async () => {
        const f = fixture(true); f.removeLabel.mockRejectedValue(new Error('denied'));
        expect((await f.invoke())[0]).toMatchObject({ success: false, executed: true,
            payload: { issueCompletion: { nativeClosed: true, closedThisRun: true, labelsChanged: 0, reconciled: false } } });
        expect(f.addLabel).not.toHaveBeenCalled();
    });
    it('reports retained removals without completion when adding 100% is denied', async () => {
        const f = fixture(); f.addLabel.mockRejectedValue(new Error('denied'));
        expect((await f.invoke())[0]).toMatchObject({ success: false, payload: { issueCompletion: { nativeClosed: true, labelsChanged: 3, reconciled: false } } });
        expect(f.labels.has('100%')).toBe(false); expect(f.labels.has('external')).toBe(true);
    });
    it('stops before the first metadata write if the issue reopened', async () => {
        const f = fixture(); const original = f.read.getMockImplementation()!;
        f.read.mockImplementationOnce(original).mockImplementationOnce(async () => { f.setState('open'); return original(); });
        expect((await f.invoke())[0]).toMatchObject({ success: false, payload: { issueCompletion: { nativeClosed: false } } });
        expect(f.removeLabel).not.toHaveBeenCalled(); expect(f.close).not.toHaveBeenCalled();
    });
    it('stops after a partial removal if reopening becomes visible', async () => {
        const f = fixture(); f.removeLabel.mockImplementationOnce(async label => { f.labels.delete(label); f.setState('open'); });
        expect((await f.invoke())[0]).toMatchObject({ success: false, payload: { issueCompletion: { nativeClosed: false, labelsChanged: 1 } } });
        expect(f.close).not.toHaveBeenCalled(); expect(f.addLabel).not.toHaveBeenCalled();
    });
    it('does not promote changed closure reasons to completion', async () => {
        const f = fixture(); f.removeLabel.mockImplementationOnce(async label => { f.labels.delete(label); f.setReason('not_planned'); });
        expect((await f.invoke())[0].success).toBe(false); expect(f.addLabel).not.toHaveBeenCalled();
    });
    it('preserves an unrelated label concurrently added during reconciliation', async () => {
        const f = fixture(); f.removeLabel.mockImplementationOnce(async label => { f.labels.delete(label); f.labels.add('concurrent-external'); });
        expect((await f.invoke())[0].success).toBe(true); expect(f.labels.has('concurrent-external')).toBe(true);
    });
    it('skips removal when another actor already removed the same stale label', async () => {
        const f = fixture(); const original = f.read.getMockImplementation()!;
        f.read.mockImplementationOnce(original).mockImplementationOnce(async () => { f.labels.delete('in-progress'); return original(); });
        expect((await f.invoke())[0].success).toBe(true); expect(f.removeLabel).not.toHaveBeenCalledWith('in-progress');
    });
    it('does not certify the final delta when new stale managed metadata appears', async () => {
        const f = fixture(); f.addLabel.mockImplementation(async label => { f.labels.add(label); f.labels.add('state:blocked'); });
        expect((await f.invoke())[0]).toMatchObject({ success: false, payload: { issueCompletion: { reconciled: false } } });
    });
    it('recognizes a concurrent native closure after a false close return', async () => {
        const f = fixture(true); f.close.mockImplementation(async () => { f.setState('closed'); return false; });
        expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { issueCompletion: { closedThisRun: false } } });
        expect(f.close).toHaveBeenCalledTimes(1);
    });
});

it('does not reclose intentionally reopened work when an older merged-PR delivery is replayed', async () => {
    const f = fixture(true); f.setReason('reopened');
    expect((await f.invoke())[0]).toMatchObject({ success: false, executed: false, payload: { issueCompletion: { nativeClosed: false } } });
    expect(f.close).not.toHaveBeenCalled(); expect(f.removeLabel).not.toHaveBeenCalled(); expect(f.addLabel).not.toHaveBeenCalled();
});
