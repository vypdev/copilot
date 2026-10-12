import {
    aggregateGithubRuntimeDoctorReport,
    GITHUB_RUNTIME_DOCTOR_GROUPS,
    parseTrustedDoctorApprovalPolicy,
    type TrustedApprovalPolicyRead,
} from '../github_runtime_doctor';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../pull_request_approval_policy';

const validPolicy = {
    ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY,
    testChecks: [{ name: 'CI', sourceAppId: 15368, workflowName: 'CI' }],
    coverage: { mode: 'check' as const, checkName: 'CI' },
};

describe('parseTrustedDoctorApprovalPolicy', () => {
    it('orders all groups and chooses the first action at the highest severity', () => {
        const report = aggregateGithubRuntimeDoctorReport({
            target: { kind: 'issue', repositoryId: 42, issueNumber: 7 },
            checks: [
                { group: 'effective-configuration', state: 'pass' },
                { group: 'approval-policy', state: 'blocked', action: 'Correct policy' },
                { group: 'workflow-contracts', state: 'unavailable', action: 'Retry' },
            ],
        });
        expect(report.checks.map(check => check.group)).toEqual(GITHUB_RUNTIME_DOCTOR_GROUPS);
        expect(report.checks.filter(check => check.state === 'unavailable')).toHaveLength(5);
        expect(report.severity).toBe('blocked');
        expect(report.primaryAction).toBe('Correct policy');
    });

    it('excludes not-applicable checks and handles an all-not-applicable report', () => {
        const report = aggregateGithubRuntimeDoctorReport({
            target: { kind: 'issue', repositoryId: 42, issueNumber: 7 },
            checks: GITHUB_RUNTIME_DOCTOR_GROUPS.map(group => ({ group, state: 'not-applicable' as const })),
        });
        expect(report.severity).toBe('not-applicable');
        expect(report.primaryAction).toBeUndefined();
    });

    it('rejects duplicate groups instead of discarding evidence', () => {
        expect(() => aggregateGithubRuntimeDoctorReport({
            target: { kind: 'issue', repositoryId: 42, issueNumber: 7 },
            checks: [
                { group: 'approval-policy', state: 'pass' },
                { group: 'approval-policy', state: 'blocked' },
            ],
        })).toThrow('Duplicate GitHub runtime doctor group');
    });

    it('rejects unknown blocked evidence instead of producing an all-not-applicable report', () => {
        expect(() => aggregateGithubRuntimeDoctorReport({target:{kind:'issue',repositoryId:42,issueNumber:7},
            checks:[...GITHUB_RUNTIME_DOCTOR_GROUPS.map(group => ({group,state:'not-applicable' as const})),
                {group:'private-unknown-group' as never,state:'blocked'}]})).toThrow('Unknown GitHub runtime doctor group');
    });

    it('parses a valid repository policy from the trusted effective read', () => {
        const read: TrustedApprovalPolicyRead = {
            status: 'available', source: 'repository', value: JSON.stringify(validPolicy),
        };
        expect(parseTrustedDoctorApprovalPolicy(read)).toEqual({
            status: 'valid', source: 'repository', policy: validPolicy,
        });
    });

    it('retains the trusted organization source when that is the effective value', () => {
        const read: TrustedApprovalPolicyRead = {
            status: 'available', source: 'organization', value: JSON.stringify(validPolicy),
        };
        expect(parseTrustedDoctorApprovalPolicy(read)).toMatchObject({ status: 'valid', source: 'organization' });
    });

    it('treats verified absence as the existing off default', () => {
        expect(parseTrustedDoctorApprovalPolicy({ status: 'absent' })).toMatchObject({
            status: 'valid', source: 'default-off', policy: { mode: 'off' },
        });
    });

    it('keeps a failed trusted read unavailable', () => {
        expect(parseTrustedDoctorApprovalPolicy({ status: 'unavailable' })).toEqual({ status: 'unavailable' });
    });

    it.each(['{', 'null', JSON.stringify({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, version: 2 })])(
        'marks successfully read malformed policy as invalid without exposing parser details', (value) => {
            expect(parseTrustedDoctorApprovalPolicy({ status: 'available', source: 'repository', value }))
                .toEqual({ status: 'invalid' });
        },
    );
});
