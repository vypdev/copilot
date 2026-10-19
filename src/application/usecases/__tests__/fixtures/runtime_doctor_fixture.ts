import type { CommentAutomationContext } from '../../comment_automation_context';
import { DOCTOR_REPOSITORY_PATHS, type DoctorRepositoryRead } from '../../../ports/github_runtime_doctor_ports';
import { sddPrerequisiteDocuments } from '../../../../testing/portable_sdd_catalog_fixture';
export const DOCTOR_HEAD = 'a'.repeat(40);
export function doctorRepositoryFixture(): Extract<DoctorRepositoryRead, { state: 'available' }> {
    const { standard, template } = sddPrerequisiteDocuments();
    const events = ['issues', 'issue_comment', 'pull_request'];
    return { state: 'available', repositoryId: 42, revision: DOCTOR_HEAD,
        trackedFiles: ['specs/safe.md', 'src/actions/github_action.ts', 'src/domain/locale.ts', 'src/domain/__tests__/locale.test.ts', 'README.md'],
        files: Object.fromEntries(DOCTOR_REPOSITORY_PATHS.map((path, index) => [path, { state: 'present', text:
            index < 3 ? `on: ${events[index]}\njobs:\n  action:\n    steps:\n      - uses: ./\n`
                : path.endsWith('.json') ? JSON.stringify({ version: 1, capabilities: [{ id: 'safe-owner', title: 'Safe owner', status: 'implemented', scope: 'Fixture', owner: 'maintainer', lastVerified: '2026-10-13',
                    specs: ['specs/safe.md'], workflows: [], entrypoints: ['src/actions/github_action.ts'], code: ['src/domain/locale.ts'],
                    tests: ['src/domain/__tests__/locale.test.ts'], documentation: ['README.md'] }] })
                    : path === 'specs/README.md' ? standard : template }])) as Extract<DoctorRepositoryRead, { state: 'available' }>['files'] };
}
export function doctorFixture() {
    const context = { trustedBotLogin: 'bot', status: { owner: 'o', repository: 'r', target: 'issue', issueNumber: 7 },
        doctorConfiguration: { profile: { schemaVersion: 1, enabled: ['feature', 'help'] }, preBranchSdd: true,
            issueManagedBranches: true, dependencyBranch: 'develop' },
        bugbot: { review: { repository: { owner: 'o', name: 'r', id: 42 },
            target: { isPullRequest: false, pullRequestNumber: 11, issueNumber: 7, headBranch: 'feature/7' },
            trigger: { kind: 'issue_comment', headOwner: 'o', expectedHeadSha: DOCTOR_HEAD }, ignorePatterns: [], organizationRules: [] } },
    } as unknown as CommentAutomationContext;
    const ports = { serverOrigin: 'https://github.com',
        readRepository: jest.fn().mockResolvedValue(doctorRepositoryFixture()),
        readIssue: jest.fn().mockResolvedValue({ number: 7, title: 'Feature', labels: ['feature', 'in-progress'], body:
            '### Description of the idea or improvement\nDoctor\n### Current limitations or challenges\nNo report\n### Expected impact\nReadable evidence' }),
        readLinkedBranch: jest.fn().mockResolvedValue({ state: 'available', repositoryId: 42, name: 'feature/7', headSha: DOCTOR_HEAD }),
        readApprovalPolicy: jest.fn().mockResolvedValue({ status: 'absent' }),
        pullRequests: { getPullRequest: jest.fn().mockResolvedValue({ number: 11, state: 'open', draft: false,
            baseRepository: { owner: 'o', name: 'r', id: 42 }, headRepositoryOwner: 'o', headRef: 'feature/7', headSha: DOCTOR_HEAD }),
            getPullRequestHeadSha: jest.fn().mockResolvedValue(DOCTOR_HEAD) },
    };
    return { context, ports };
}
