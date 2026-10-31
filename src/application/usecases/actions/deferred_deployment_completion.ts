import { Result } from '../../../data/model/result';
import type { NativeIssueCompletionFacts } from '../../../domain/issue_completion';

export function deferredDeploymentCompletionResult(id: string, facts: NativeIssueCompletionFacts, nested = false): Result {
    const completion = { nativeClosed: facts.state === 'closed', reconciled: false,
        deploymentCompletion: 'pending', outcome: 'deferred' };
    return new Result({ id, success: true, executed: false,
        steps: ['Issue completion is deferred until deployment publication, reconciliation and cleanup are verified.',
            ...(facts.state === 'closed' ? ['The existing native closure was retained for inspection.'] : [])],
        payload: nested ? { issueCompletion: completion } : completion });
}
