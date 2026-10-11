import {
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
