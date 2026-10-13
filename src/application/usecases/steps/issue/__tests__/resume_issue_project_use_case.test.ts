import { ResumeIssueProjectUseCase } from '../resume_issue_project_use_case';
import type { MoveIssueToInProgressContext } from '../../../issue_workflow_context';

const project = (id: string) => ({ id, title: id, owner: 'o', type: 'organization', url: 'https://github.com/orgs/o/projects/1', number: 1 });
function fixture() {
    const open = { number: 42, state: 'open', reason: 'reopened', labels: ['in-progress', 'bugfix'] };
    const readIssue = jest.fn().mockResolvedValue(open);
    const moveIssueToColumn = jest.fn().mockResolvedValue(true);
    const context = { issueNumber: 42, columnName: 'In Progress', projects: [project('p1')] } as MoveIssueToInProgressContext;
    const useCase = new ResumeIssueProjectUseCase({ readIssue }, { moveIssueToColumn } as never);
    return { open, readIssue, moveIssueToColumn, context, useCase };
}
const verified = (result: Awaited<ReturnType<ResumeIssueProjectUseCase['invoke']>>) => result[0].payload;

describe('reopened issue Project reconciliation', () => {
    it('moves terminal Project state before allowing enrichment', async () => {
        const f = fixture(); const result = await f.useCase.invoke(f.context);
        expect(result[0].success).toBe(true); expect(verified(result)).toEqual({ resumedProject: { changed: 1, verified: true } });
        expect(f.moveIssueToColumn).toHaveBeenCalledWith(f.context.projects[0], 42, 'In Progress');
        expect(f.readIssue).toHaveBeenCalledTimes(3);
    });
    it('reports replay as a verified no-op when the adapter already has active state', async () => {
        const f = fixture(); f.moveIssueToColumn.mockResolvedValue(false);
        const result = await f.useCase.invoke(f.context);
        expect(result[0]).toMatchObject({ success: true, executed: false });
        expect(verified(result)).toEqual({ resumedProject: { changed: 0, verified: true } });
    });
    it('supports repositories without a configured Project', async () => {
        const f = fixture(); const result = await f.useCase.invoke({ ...f.context, projects: [] });
        expect(result[0].success).toBe(true); expect(f.readIssue).toHaveBeenCalledTimes(1); expect(f.moveIssueToColumn).not.toHaveBeenCalled();
    });
    it.each([
        ['wrong subject', { number: 43 }], ['closed', { state: 'closed', reason: 'completed' }],
        ['no verified reopening', { reason: 'unknown' }], ['start removed', { labels: ['bugfix'] }],
    ])('stops before a Project write for %s', async (_name, delta) => {
        const f = fixture(); f.readIssue.mockResolvedValue({ ...f.open, ...delta });
        const result = await f.useCase.invoke(f.context);
        expect(result[0]).toMatchObject({ success: false, executed: false }); expect(f.moveIssueToColumn).not.toHaveBeenCalled();
        expect(result[0].errors[0]).toMatchObject({ code: 'workflow.stale' });
    });
    it('fails closed when the first native read fails', async () => {
        const f = fixture(); f.readIssue.mockRejectedValue(new Error('offline'));
        expect((await f.useCase.invoke(f.context))[0].success).toBe(false); expect(f.moveIssueToColumn).not.toHaveBeenCalled();
    });
    it('fences closure between admission and the first mutation', async () => {
        const f = fixture(); f.readIssue.mockResolvedValueOnce(f.open).mockResolvedValue({ ...f.open, state: 'closed' });
        expect((await f.useCase.invoke(f.context))[0].success).toBe(false); expect(f.moveIssueToColumn).not.toHaveBeenCalled();
    });
    it('retains a successful write when the issue closes immediately afterwards', async () => {
        const f = fixture(); f.readIssue.mockResolvedValueOnce(f.open).mockResolvedValueOnce(f.open).mockResolvedValue({ ...f.open, state: 'closed' });
        const result = await f.useCase.invoke(f.context);
        expect(result[0]).toMatchObject({ success: false, executed: true }); expect(verified(result)).toEqual({ resumedProject: { changed: 1, verified: false } });
    });
    it('fences start-label removal before the next Project mutation', async () => {
        const f = fixture(); f.readIssue.mockResolvedValueOnce(f.open).mockResolvedValueOnce(f.open).mockResolvedValueOnce(f.open).mockResolvedValue({ ...f.open, labels: [] });
        const result = await f.useCase.invoke({ ...f.context, projects: [project('p1'), project('p2')] } as MoveIssueToInProgressContext);
        expect(result[0].success).toBe(false); expect(f.moveIssueToColumn).toHaveBeenCalledTimes(1);
    });
    it('retains first-Project success when a second provider write fails', async () => {
        const f = fixture(); f.moveIssueToColumn.mockResolvedValueOnce(true).mockRejectedValue(new Error('offline'));
        const result = await f.useCase.invoke({ ...f.context, projects: [project('p1'), project('p2')] } as MoveIssueToInProgressContext);
        expect(verified(result)).toEqual({ resumedProject: { changed: 1, verified: false } }); expect(result[0].executed).toBe(true);
    });
    it('stops on a failed first Project write', async () => {
        const f = fixture(); f.moveIssueToColumn.mockRejectedValue(new Error('offline'));
        expect((await f.useCase.invoke(f.context))[0]).toMatchObject({ success: false, executed: false });
    });
    it('retains the write when the final native read is unavailable', async () => {
        const f = fixture(); f.readIssue.mockResolvedValueOnce(f.open).mockResolvedValueOnce(f.open).mockRejectedValue(new Error('offline'));
        expect((await f.useCase.invoke(f.context))[0]).toMatchObject({ success: false, executed: true });
    });
    it('uses the configured active column without changing shared Project automation', async () => {
        const f = fixture(); await f.useCase.invoke({ ...f.context, columnName: 'Working' });
        expect(f.moveIssueToColumn).toHaveBeenCalledWith(f.context.projects[0], 42, 'Working');
    });
    it('reconciles every configured Project sequentially with fresh reads', async () => {
        const f = fixture(); const result = await f.useCase.invoke({ ...f.context, projects: [project('p1'), project('p2')] } as MoveIssueToInProgressContext);
        expect(verified(result)).toEqual({ resumedProject: { changed: 2, verified: true } }); expect(f.readIssue).toHaveBeenCalledTimes(5);
    });
    it.each([0, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe issue identity %s', async issueNumber => {
        const f = fixture(); expect((await f.useCase.invoke({ ...f.context, issueNumber }))[0].success).toBe(false);
        expect(f.readIssue).not.toHaveBeenCalled(); expect(f.moveIssueToColumn).not.toHaveBeenCalled();
    });
});
