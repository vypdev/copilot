import type { getOctokit } from '@actions/github';
import { githubBugbotStatusCardOperation } from './github_bugbot_status_card_handoff';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';
import { bugbotStatusCardPath, bugbotStatusCardWorkflow, statusCardGithubErrorStatus } from './github_bugbot_status_card_installation';

class StatusCardAcknowledgmentError extends Error {}

export const statusCardUnacknowledged = () => new StatusCardAcknowledgmentError('The shared Bugbot status card writer did not acknowledge publication. Inspect its native run and retry acknowledgment; preserve the last verified card and Check fallback.');

/** Correlation is data provenance, never independent producer-code attestation. */
export function createGithubBugbotStatusCardAcknowledgment(binding: {
    read: ReturnType<typeof getOctokit>; write: ReturnType<typeof getOctokit>;
    scope: { owner: string; repo: string }; ref: string; runId: number; attempt: number; repositoryId: number;
}) {
    const { read, write, scope, ref, runId, attempt, repositoryId } = binding;
    const workflow = { ...scope, workflow_id: bugbotStatusCardWorkflow };
    const unresolved = statusCardUnacknowledged;
    const acknowledgments = new Map<string, { issued: boolean; id?: number; pending?: Promise<number> }>();
    return async (inputs: { pull_number: string; work: string }, sequence?: number): Promise<{ id: number; title: string }> => {
        const operation = githubBugbotStatusCardOperation(inputs.work, sequence);
        const title = 'Bugbot status · PR ' + inputs.pull_number + ' · ' + operation;
        let acknowledgment = acknowledgments.get(operation);
        if (!acknowledgment) {
            acknowledgment = { issued: false };
            acknowledgments.set(operation, acknowledgment);
        }
        if (acknowledgment.id) return { id: acknowledgment.id, title };
        if (acknowledgment.pending) return { id: await acknowledgment.pending, title };
        const state = acknowledgment;
        state.pending = (async (): Promise<number> => {
            if (!state.issued) {
                // A lost response can still mean accepted: retry reads, never this POST.
                state.issued = true;
                const { data } = await write.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
                    ...workflow, ref, inputs: { ...inputs, operation }, return_run_details: true,
                });
                const direct = parsePositiveSafeInteger((data as { workflow_run_id?: number } | undefined)?.workflow_run_id);
                if (direct) return state.id = direct;
            }
            for (let lookup = 0; lookup < 6; lookup += 1) {
                try {
                    const expected = await read.rest.actions.getWorkflow(workflow);
                    const origin = await read.rest.actions.getWorkflowRun({ ...scope, run_id: runId });
                    const created = origin.data.created_at;
                    if (!parsePositiveSafeInteger(expected.data.id) || expected.data.path !== bugbotStatusCardPath
                        || origin.data.id !== runId || origin.data.repository.id !== repositoryId || origin.data.run_attempt !== attempt
                        || typeof created !== 'string' || !Number.isFinite(Date.parse(created))) throw unresolved();
                    const matches = new Set<number>();
                    const seen = new Set<number>();
                    let complete = false;
                    let total: number | undefined;
                    for (let page = 1; page <= 10; page += 1) {
                        const response: Awaited<ReturnType<typeof read.rest.actions.listWorkflowRuns>> = await read.rest.actions.listWorkflowRuns({ ...workflow,
                            branch: ref, event: 'workflow_dispatch', created: '>=' + created, per_page: 100, page });
                        const data = response.data;
                        if (!Array.isArray(data.workflow_runs) || data.workflow_runs.length > 100
                            || !Number.isSafeInteger(data.total_count) || data.total_count < 0
                            || total !== undefined && total !== data.total_count) throw unresolved();
                        total = data.total_count;
                        for (const run of data.workflow_runs) {
                            const id = parsePositiveSafeInteger(run.id);
                            if (!id || seen.has(id)) throw unresolved();
                            seen.add(id);
                            if (run.repository.id === repositoryId && run.workflow_id === expected.data.id
                                && run.path === bugbotStatusCardPath && run.event === 'workflow_dispatch'
                                && run.head_branch === ref && run.display_title === title && run.run_attempt === 1
                                && Number.isFinite(Date.parse(run.created_at)) && Date.parse(run.created_at) >= Date.parse(created)) matches.add(id);
                        }
                        if (seen.size === total || data.workflow_runs.length < 100) {
                            if (data.total_count !== seen.size) throw unresolved();
                            complete = true;
                            break;
                        }
                    }
                    if (!complete || matches.size > 1) throw unresolved();
                    if (matches.size === 1) return state.id = [...matches][0];
                } catch (error) {
                    if ([401, 403].includes(Number(statusCardGithubErrorStatus(error))) || error instanceof StatusCardAcknowledgmentError) throw unresolved();
                    if (lookup === 5) throw unresolved();
                }
                if (lookup < 5) await new Promise(resolve => setTimeout(resolve, 500));
            }
            throw unresolved();
        })().catch(() => { throw unresolved(); });
        try { return { id: await state.pending, title }; }
        catch { throw unresolved(); }
        finally { state.pending = undefined; }
    };
}
