import { CopilotEvidenceRepository } from '../copilot_evidence_repository';
import { buildBugbotProgressCheckMarker, readBugbotProgressCheckObservation } from '../../../application/policies/bugbot_progress_check_observation_policy';
import type { BugbotReviewProgressObservation } from '../../../application/ports/bugbot_review_progress_ports';

describe('CopilotEvidenceRepository', () => {
    it('reports a missing artifact capability without treating the created check as an approval receipt', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create } } }) });
        await expect(repository.publish({ name: 'Copilot / Review', headSha: 'head', conclusion: 'success', title: 'Complete',
            summary: 'Receipt', verification: { runId: 7, attempt: 2, receipt: 'Receipt' } }, 'owner', 'repo', 'token'))
            .rejects.toMatchObject({ code: 'provider.contract-invalid', message: 'Optional Check Run publication was not confirmed.' });
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', conclusion: 'success' }));
    });

    it.each([false, true])('attributes the receipt artifact to the created or reused native Check Run, reuse=%s', async reuse => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn().mockResolvedValue({});
        const publish = jest.fn().mockResolvedValue(undefined);
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) }, { publish });
        if (reuse) await repository.observeReview({ headSha: 'head', externalId: 'attempt', title: 'Preparing', summary: 'Source',
            runUrl: 'https://github.com/owner/repo/actions/runs/7' }, 'owner', 'repo', 'token');
        const verification = { runId: 7, attempt: 2, receipt: '<!-- copilot-bugbot-verification:v1 {} -->' };
        await repository.publish({ name: 'Copilot / Review', headSha: 'head', conclusion: 'success', title: 'Complete',
            summary: verification.receipt, verification }, 'owner', 'repo', 'token');
        expect(publish).toHaveBeenCalledWith(91, verification);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('reports receipt artifact upload failure after publishing its nonauthorizing check', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const publish = jest.fn().mockRejectedValue(new Error('controlled failure'));
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create } } }) }, { publish });
        await expect(repository.publish({ name: 'Copilot / Review', headSha: 'head', conclusion: 'success', title: 'Complete',
            summary: 'Receipt', verification: { runId: 7, attempt: 2, receipt: 'Receipt' } }, 'owner', 'repo', 'token'))
            .rejects.toBeDefined();
        expect(create).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledTimes(1);
    });

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

    it.each([undefined, 'failure'] as const)('closes an unfinished observation without approval evidence (%s)', async conclusion => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn().mockResolvedValue({});
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        await repository.observeReview({ headSha: 'head', externalId: 'attempt', title: 'Preparing', summary: 'Source', runUrl: 'https://github.com/owner/repo/actions/runs/7' }, 'owner', 'repo', 'token');
        await repository.retireLiveReviews('owner', 'other', 'token');
        expect(update).not.toHaveBeenCalled();
        await repository.retireLiveReviews('owner', 'repo', 'token', conclusion);
        expect(update).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', check_run_id: 91,
            status: 'completed', conclusion: conclusion ?? 'neutral' });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('retains the exact last observation on the same failed review check', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 91 } });
        const update = jest.fn().mockResolvedValue({});
        const repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create, update } } }) });
        const baseSha = 'a'.repeat(40);
        const headSha = 'b'.repeat(40);
        const externalId = `bugbot:951:${baseSha}:${headSha}:default:7:2`;
        const runUrl = 'https://github.com/owner/repo/actions/runs/7/attempts/2';
        const observation: BugbotReviewProgressObservation = { stage: 'analyzing', baseSha, headSha, pullNumber: 951,
            elapsedMs: 2160000, observedAt: '2026-11-17T22:06:57.300Z', sequence: 8, partitions: { total: 110, completed: 8 }, retries: 3 };
        const terminal: BugbotReviewProgressObservation = { ...observation, stage: 'finished', outcome: 'failed',
            failureCode: 'agent.failed', elapsedMs: 2161000, observedAt: '2026-11-17T22:06:58.719Z', sequence: 9 };
        const progress = (facts: BugbotReviewProgressObservation, attempt = externalId) =>
            `8/110 partitions validated · ${facts.observedAt}\n[Workflow run](${runUrl})\n\n${buildBugbotProgressCheckMarker(facts, attempt)}`;
        await repository.observeReview({ headSha, externalId, title: 'Analyzing', summary: progress(observation), runUrl }, 'owner', 'repo', 'token');
        await repository.observeReview({ headSha, externalId, title: 'Review failed', summary: progress(terminal), runUrl }, 'owner', 'repo', 'token');
        await repository.observeReview({ headSha, externalId, title: 'Other attempt', summary: progress(terminal, externalId.replace(/:2$/u, ':1')), runUrl }, 'owner', 'repo', 'token');
        await repository.publish({ name: 'Copilot / Review', headSha, conclusion: 'failure', title: 'Failed', summary: 'Authoritative failure' }, 'owner', 'repo', 'token');
        expect(create).toHaveBeenCalledTimes(1);
        const completion = update.mock.calls.at(-1)?.[0];
        expect(completion).toMatchObject({ check_run_id: 91, status: 'completed', conclusion: 'failure',
            output: { summary: 'Authoritative failure', text: progress(terminal) } });
        expect(readBugbotProgressCheckObservation(completion.output.text, externalId)).toEqual(terminal);
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
