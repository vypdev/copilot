import { projectPullRequestReadiness } from '../pull_request_readiness_policy';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../domain/pull_request_approval_policy';
import type { ApprovalEvidence } from '../../../domain/pull_request_approval';
import { serializePullRequestApprovalPolicy } from '../../../domain/pull_request_approval_policy';

const policy = (mode: 'off' | 'recommend' | 'guarded') => serializePullRequestApprovalPolicy({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode,
    producerAttested: true, testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
    coverage: { mode: 'check', checkName: 'CI Check' } });
const evidence = { repositoryId: 1, pullNumber: 2, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40) } as ApprovalEvidence;
const final = { repositoryId: 1, pullNumber: 2, headSha: evidence.headSha, baseSha: evidence.baseSha, rawPolicy: policy('guarded') };

describe('projectPullRequestReadiness', () => {
    it('reports off as not applicable without a readiness claim', () => {
        expect(projectPullRequestReadiness(policy('off'), evidence, { ...final, rawPolicy: policy('off') }))
            .toMatchObject({ readiness: 'not-applicable', mode: 'off' });
    });
    it('does not call out-of-scope incomplete evidence satisfied in recommend mode', () => {
        expect(projectPullRequestReadiness(policy('recommend'), evidence, { ...final, rawPolicy: policy('recommend') }))
            .toMatchObject({ readiness: 'not-applicable', mode: 'recommend' });
    });
    it.each(['headSha', 'baseSha'] as const)('fences a changed %s', (field) => {
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, [field]: 'c'.repeat(40) }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
    it('fences a changed policy identity', () => {
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, rawPolicy: policy('recommend') }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
    it('fails closed for malformed policy and foreign PR identity', () => {
        expect(projectPullRequestReadiness('{', evidence, final)).toMatchObject({ readiness: 'unavailable' });
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, repositoryId: 9 }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
});
