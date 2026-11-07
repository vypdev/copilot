import type { FindingsQueryPort } from '../ports/agent_findings_ports';
import { PROGRESS_BATCH_PROFILE, progressBatchRejected } from './progress_batch_policy';

/** One ledger covers classification, evidence, assessment and every existing bounded repair. */
export function boundProgressBatchAgent(agent: FindingsQueryPort, now = () => performance.now()) {
    const started = now();
    const deadline = AbortSignal.timeout(PROGRESS_BATCH_PROFILE.milliseconds);
    let calls = 0;
    const verify = () => {
        if (now() - started > PROGRESS_BATCH_PROFILE.milliseconds || deadline.aborted) throw progressBatchRejected('time-budget');
    };
    const bounded: FindingsQueryPort = { query: async request => {
        verify();
        if (calls >= PROGRESS_BATCH_PROFILE.calls) throw progressBatchRejected('call-budget');
        calls++;
        let response;
        try {
            response = await agent.query({ ...request, signal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline });
        } catch (error) {
            verify();
            throw error;
        }
        verify();
        return response;
    } };
    return { agent: bounded, calls: () => calls, verify };
}
