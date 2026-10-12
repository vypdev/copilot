import { readinessEvidence, readinessPolicy, READINESS_HEAD, READINESS_BASE } from '../../usecases/__tests__/fixtures/pr_readiness_fixture';
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
    it('retains independently satisfied gates with approval disabled', () => {
        const e = readinessEvidence(); const rawPolicy = readinessPolicy('off');
        expect(projectPullRequestReadiness(rawPolicy, e, { ...e, rawPolicy })).toMatchObject({ readiness: 'not-applicable',
            code: 'disabled', action: 'none', evidence: { ci: 'satisfied', coverage: 'satisfied', bugbot: 'satisfied', reviews: 'satisfied' } });
    });
    it('retains failed CI and native changes-requested facts with approval disabled', () => {
        const e = readinessEvidence(); const rawPolicy = readinessPolicy('off');
        const changed = { ...e, checks: [{ ...e.checks[0], conclusion: 'failure' }],
            reviews: [{ id: 10, userId: 30, state: 'CHANGES_REQUESTED', commitId: READINESS_HEAD, submittedAt: '2026-10-11T10:00:00Z' }] };
        expect(projectPullRequestReadiness(rawPolicy, changed, { ...e, rawPolicy })).toMatchObject({ readiness: 'not-applicable',
            code: 'disabled', action: 'none', evidence: { ci: 'blocked', coverage: 'blocked', bugbot: 'satisfied', reviews: 'blocked' } });
    });
    it('does not call out-of-scope incomplete evidence satisfied in recommend mode', () => {
        expect(projectPullRequestReadiness(policy('recommend'), evidence, { ...final, rawPolicy: policy('recommend') }))
            .toMatchObject({ readiness: 'unavailable', mode: 'recommend' });
    });
    it.each(['headSha', 'baseSha'] as const)('fences a changed %s', (field) => {
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, [field]: 'c'.repeat(40) }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
    it.each(['headSha','baseSha'] as const)('keeps verified off disabled after a changed %s, without stale native groups', field => {
        const e = readinessEvidence(), rawPolicy = readinessPolicy('off');
        expect(projectPullRequestReadiness(rawPolicy,e,{...e,rawPolicy,[field]:'d'.repeat(40)})).toMatchObject({
            readiness:'not-applicable',mode:'off',code:'disabled',headSha:'',baseSha:'',
            evidence:{ci:'unavailable',coverage:'unavailable',bugbot:'unavailable',reviews:'unavailable'}});
    });
    it('keeps verified off disabled without certifying malformed native revision facts', () => {
        const e=readinessEvidence(),rawPolicy=readinessPolicy('off');
        expect(projectPullRequestReadiness(rawPolicy,{...e,baseSha:'short'},{...e,rawPolicy})).toMatchObject({readiness:'not-applicable',mode:'off',code:'disabled',baseSha:''});
    });
    it.each([
        {repositoryId:0}, {repositoryId:Number.NaN}, {pullNumber:0}, {pullNumber:Number.MAX_SAFE_INTEGER+1},
    ])('keeps malformed final target identity unavailable %#', invalid => {
        const e=readinessEvidence(),rawPolicy=readinessPolicy();
        expect(projectPullRequestReadiness(rawPolicy,e,{...e,rawPolicy,...invalid})).toMatchObject({
            readiness:'unavailable',code:'identity-unavailable',headSha:'',baseSha:'',
            evidence:{ci:'unavailable',coverage:'unavailable',bugbot:'unavailable',reviews:'unavailable'}});
    });
    it('fences a changed policy identity', () => {
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, rawPolicy: policy('recommend') }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
    it('fails closed for malformed policy and foreign PR identity', () => {
        expect(projectPullRequestReadiness('{', evidence, final)).toMatchObject({ readiness: 'blocked', mode: 'unavailable' });
        expect(projectPullRequestReadiness(policy('guarded'), evidence, { ...final, repositoryId: 9 }))
            .toMatchObject({ readiness: 'pending', code: 'superseded' });
    });
});

describe('independent canonical readiness evidence', () => {
    const numeric = { mode: 'numeric' as const, checkName: 'CI Check', minDiffPercent: 90, artifactWorkflowName: 'CI Check', reporterAttested: true };
    const project = (e = readinessEvidence(), raw = readinessPolicy(), revision = {}) => projectPullRequestReadiness(raw, e,
        { repositoryId: 1, pullNumber: 11, headSha: READINESS_HEAD, baseSha: READINESS_BASE, rawPolicy: raw, ...revision });
    it('exposes all independent gates for a satisfied guarded snapshot', () => {
        expect(project()).toMatchObject({ readiness: 'satisfied', mode: 'guarded', action: 'observer', humanReviewRequired: false, evidence: { ci: 'satisfied', coverage: 'satisfied', bugbot: 'satisfied', reviews: 'satisfied' } });
    });
    it('keeps a satisfied recommendation explicitly dependent on a human', () => {
        expect(project(readinessEvidence(), readinessPolicy('recommend'))).toMatchObject({ readiness: 'satisfied', action: 'human-review', humanReviewRequired: true });
    });
    it('does not erase successful CI when the review history is incomplete', () => {
        expect(project(readinessEvidence({ reviewHistoryComplete: false }))).toMatchObject({ readiness: 'unavailable', evidence: { ci: 'satisfied', reviews: 'unavailable' } });
    });
    it('does not present partial Bugbot coverage as a verified blocker or clean review', () => {
        const e = readinessEvidence(); expect(project({ ...e, bugbot: { ...e.bugbot!, coverage: 'partial' } })).toMatchObject({ readiness: 'unavailable', evidence: { ci: 'satisfied', bugbot: 'unavailable' } });
    });
    it('retains other verified facts when a trusted check fails', () => {
        const e = readinessEvidence(); expect(project({ ...e, checks: [{ ...e.checks[0], conclusion: 'failure' }] })).toMatchObject({ readiness: 'blocked', action: 'resolve', evidence: { ci: 'blocked', bugbot: 'satisfied' } });
    });
    it('waits for an unfinished current-head check', () => {
        const e = readinessEvidence(); expect(project({ ...e, checks: [{ ...e.checks[0], status: 'in_progress', conclusion: null }] })).toMatchObject({ readiness: 'pending', action: 'wait' });
    });
    it('refuses a check with an incorrect producer', () => {
        const e = readinessEvidence(); expect(project({ ...e, checks: [{ ...e.checks[0], sourceAppId: 99 }] })).toMatchObject({ readiness: 'blocked', evidence: { ci: 'blocked' } });
    });
    it('refuses a same-name check from an untrusted workflow', () => {
        const e = readinessEvidence(); expect(project({ ...e, checks: [{ ...e.checks[0], workflowName: 'Other' }] })).toMatchObject({ readiness: 'blocked', code: 'check-source' });
    });
    it('never certifies an unattested producer', () => {
        expect(project(readinessEvidence(), readinessPolicy('recommend', { producerAttested: false }))).toMatchObject({ readiness: 'blocked', evidence: { ci: 'blocked', coverage: 'blocked' } });
    });
    it('requires verified test-merge parentage', () => {
        expect(project(readinessEvidence({ mergeCommitVerified: false, testedMergeSha: undefined }))).toMatchObject({ readiness: 'pending', evidence: { ci: 'pending' } });
    });
    it.each(['success', 'failure', 'missing', 'running', 'wrong-app', 'wrong-workflow', 'old-head', 'ambiguous'] as const)(
        'projects the configured coverage check independently of another failed CI check: %s', scenario => {
            const e = readinessEvidence();
            const coverage = { ...e.checks[0], name: 'Coverage', workflowName: 'Coverage' };
            const checks: ApprovalEvidence['checks'][number][] = [{ ...e.checks[0], conclusion: 'failure' }];
            if (scenario !== 'missing') checks.push({ ...coverage,
                conclusion: scenario === 'failure' ? 'failure' : scenario === 'running' ? null : 'success',
                status: scenario === 'running' ? 'in_progress' : 'completed',
                sourceAppId: scenario === 'wrong-app' ? 99 : coverage.sourceAppId,
                workflowName: scenario === 'wrong-workflow' ? 'Other' : coverage.workflowName,
                headSha: scenario === 'old-head' ? 'd'.repeat(40) : coverage.headSha });
            if (scenario === 'ambiguous') checks.push(coverage);
            const raw = readinessPolicy('guarded', { testChecks: [
                { name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' },
                { name: 'Coverage', sourceAppId: 15368, workflowName: 'Coverage' },
            ], coverage: { mode: 'check', checkName: 'Coverage' } });
            const expected = scenario === 'success' ? 'satisfied'
                : ['missing', 'running', 'old-head'].includes(scenario) ? 'pending' : 'blocked';
            expect(project({ ...e, checks }, raw)).toMatchObject({ readiness: 'blocked', evidence: { ci: 'blocked', coverage: expected } });
        });
    it('marks missing numeric coverage unavailable while retaining successful CI', () => {
        expect(project(readinessEvidence(), readinessPolicy('guarded', { coverage: numeric }))).toMatchObject({ readiness: 'unavailable', evidence: { ci: 'satisfied', coverage: 'unavailable' } });
    });
    it('blocks verified numeric coverage below the threshold', () => {
        expect(project(readinessEvidence({ numericCoverage: { headSha: READINESS_HEAD, baseSha: READINESS_BASE, coveredChangedLines: 8, totalChangedLines: 10 } }),
            readinessPolicy('guarded', { coverage: numeric }))).toMatchObject({ readiness: 'blocked', evidence: { coverage: 'blocked' } });
    });
    it('does not exempt documentation-folder executable files', () => {
        expect(project(readinessEvidence({ changedPaths: ['docs/code.js'] }), readinessPolicy('guarded', { coverage: numeric }))).toMatchObject({ evidence: { coverage: 'unavailable' } });
    });
    it('retains the canonical documentation-only numeric exemption', () => {
        expect(project(readinessEvidence({ changedPaths: ['docs/guide.mdx'] }), readinessPolicy('guarded', { coverage: numeric }))).toMatchObject({ readiness: 'satisfied' });
    });
    it('blocks an unattested numeric reporter independently of CI', () => {
        expect(project(readinessEvidence(), readinessPolicy('recommend', { coverage: { ...numeric, reporterAttested: false } }))).toMatchObject({ readiness: 'blocked', evidence: { ci: 'satisfied', coverage: 'blocked' } });
    });
    it('does not mistake an old Bugbot head for current evidence', () => {
        const e=readinessEvidence(); expect(project({ ...e, bugbot: { ...e.bugbot!, headSha: 'd'.repeat(40) } })).toMatchObject({ readiness: 'pending', evidence: { bugbot: 'pending' } });
    });
    it('blocks unresolved current-head findings', () => {
        const e=readinessEvidence(); expect(project({ ...e, bugbot: { ...e.bugbot!, verificationRequired: 1 } })).toMatchObject({ readiness: 'blocked', evidence: { bugbot: 'blocked' } });
    });
    it('does not certify a dry-run Bugbot configuration', () => {
        expect(project(readinessEvidence({ bugbotDryRun: true }))).toMatchObject({ readiness: 'blocked', evidence: { bugbot: 'blocked' } });
    });
    it('retains current native changes-requested evidence', () => {
        expect(project(readinessEvidence({ reviews: [{ id: 4, userId: 30, state: 'CHANGES_REQUESTED', commitId: READINESS_HEAD, submittedAt: '2026-10-11T10:00:00Z' }] }))).toMatchObject({ readiness: 'blocked', evidence: { reviews: 'blocked' } });
    });
    it('recognizes only a verified approval on this exact bot revision', () => {
        expect(project(readinessEvidence({ reviews: [{ id: 4, userId: 20, state: 'APPROVED', commitId: READINESS_HEAD, submittedAt: '2026-10-11T10:00:00Z' }] }))).toMatchObject({ readiness: 'satisfied', humanReviewRequired: false, evidence: { reviews: 'satisfied' } });
    });
    it('preserves human dismissal without suggesting automatic approval', () => {
        expect(project(readinessEvidence({ reviews: [{ id: 4, userId: 20, state: 'DISMISSED', commitId: READINESS_HEAD, submittedAt: '2026-10-11T10:00:00Z' }] }))).toMatchObject({ readiness: 'not-applicable', evidence: { reviews: 'not-applicable' } });
    });
    it('does not discard a current human approval as unavailable', () => {
        expect(project(readinessEvidence({ reviews: [{ id: 4, userId: 30, state: 'APPROVED', commitId: READINESS_HEAD, submittedAt: '2026-10-11T10:00:00Z' }] }))).toMatchObject({ readiness:'satisfied', action: 'none', humanReviewRequired: false, evidence: { reviews: 'satisfied' } });
    });
    it('discards all satisfied gates when the final revision changes', () => {
        expect(project(readinessEvidence(), readinessPolicy(), { headSha: 'd'.repeat(40) })).toMatchObject({ readiness: 'pending', evidence: { ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' } });
    });
    it('refuses malformed or abbreviated revision identity', () => {
        expect(project(readinessEvidence({ headSha: 'abcdef' }))).toMatchObject({ readiness: 'unavailable', mode: 'unavailable' });
    });
});
