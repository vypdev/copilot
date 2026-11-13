import { CopilotEvidenceRepository } from '../copilot_evidence_repository';

describe('CopilotEvidenceRepository', () => {
    it('creates a completed native Check Run with bounded evidence', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 1 } });
        const repository = new CopilotEvidenceRepository({
            getClient: jest.fn(() => ({ rest: { checks: { create } } })),
        });

        await repository.publish({
            name: 'Copilot / Review',
            headSha: 'sha-1',
            conclusion: 'success',
            title: 'Completed',
            summary: '## Summary',
        }, 'owner', 'repo', 'token');

        expect(create).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            name: 'Copilot / Review',
            head_sha: 'sha-1',
            status: 'completed',
            conclusion: 'success',
            output: { title: 'Completed', summary: '## Summary' },
        });
    });

    it('reuses the native review check for progress and the terminal receipt', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn().mockResolvedValue({});
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        const live = { headSha: 'head', externalId: 'attempt-2', title: 'Preparing', summary: 'Preparing source', runUrl: 'https://github.com/owner/repo/actions/runs/7' };
        await repository.observeReview(live, 'owner', 'repo', 'token');
        await repository.observeReview({ ...live, externalId: 'attempt-1' }, 'owner', 'repo', 'token');
        await repository.observeReview({ ...live, title: 'Analyzing' }, 'owner', 'repo', 'token');
        await repository.publish({ name: 'Copilot / Review', headSha: live.headSha, conclusion: 'success', title: 'Complete', summary: 'Authoritative result' }, 'owner', 'repo', 'token');
        await repository.retireLiveReviews('owner', 'repo', 'token');
        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0]).toMatchObject({ status: 'in_progress', external_id: 'attempt-2' });
        expect(update).toHaveBeenCalledTimes(2);
        expect(update.mock.calls[0][0]).toMatchObject({ check_run_id: 91, output: { title: 'Analyzing' } });
        expect(update.mock.calls[1][0]).toMatchObject({ check_run_id: 91, status: 'completed', conclusion: 'success', output: { summary: 'Authoritative result' } });
    });

    it('closes an unfinished observation without creating approval evidence', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn().mockResolvedValue({});
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        await repository.observeReview({ headSha: 'head', externalId: 'attempt', title: 'Preparing', summary: 'Source', runUrl: 'https://github.com/owner/repo/actions/runs/7' }, 'owner', 'repo', 'token');
        await repository.retireLiveReviews('owner', 'other', 'token');
        expect(update).not.toHaveBeenCalled();
        await repository.retireLiveReviews('owner', 'repo', 'token');
        expect(update).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', check_run_id: 91, status: 'completed', conclusion: 'neutral' });
    });

    it('keeps terminal publication available when the client cannot update a check', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create } } }) });
        const evidence = { name: 'Copilot / Review' as const, headSha: 'head', conclusion: 'success' as const, title: 'Complete', summary: 'Result' };
        await repository.observeReview({ ...evidence, externalId: 'attempt', runUrl: 'https://github.com/owner/repo/actions/runs/7' }, 'owner', 'repo', 'token');
        expect(create).not.toHaveBeenCalled();
        await repository.publish(evidence, 'owner', 'repo', 'token');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it.each([undefined, { data: {} }, { data: { id: 0 } }])('does not repeat an ambiguous live check creation (%j)', async response => {
        const create = jest.fn().mockResolvedValue(response);
        const update = jest.fn();
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        const live = { headSha: 'head', externalId: 'attempt', title: 'Preparing', summary: 'Source', runUrl: 'https://github.com/owner/repo/actions/runs/7' };
        await expect(repository.observeReview(live, 'owner', 'repo', 'token')).rejects.toThrow();
        await repository.observeReview(live, 'owner', 'repo', 'token');
        expect(create).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
    });

    it('rejects a malformed terminal Check Run creation', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 0 } });
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create } } }) });
        await expect(repository.publish({ name: 'Copilot / Plan', headSha: 'head', conclusion: 'success', title: 'Complete', summary: 'Result' },
            'owner', 'repo', 'token')).rejects.toThrow();
    });

    it('keeps plan and review evidence separate even on the same head', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn();
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        await repository.observeReview({ headSha: 'head', externalId: 'attempt', title: 'Preparing', summary: 'Source', runUrl: 'https://github.com/owner/repo/actions/runs/7' }, 'owner', 'repo', 'token');
        await repository.publish({ name: 'Copilot / Plan', headSha: 'head', conclusion: 'success', title: 'Complete', summary: 'Plan' }, 'owner', 'repo', 'token');
        expect(create).toHaveBeenCalledTimes(2);
        expect(update).not.toHaveBeenCalled();
    });
});
