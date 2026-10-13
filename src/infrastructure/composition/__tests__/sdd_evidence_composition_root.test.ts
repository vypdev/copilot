import { renderSddGateRecord, type SddGateRecord } from '../../../domain/pre_branch_sdd';
import { buildSddIssueDigest } from '../../../application/policies/sdd_issue_identity_policy';
import { createSddEvidenceQueryPort, createSddEvidenceReadPorts } from '../sdd_evidence_composition_root';

const mockTitle = jest.fn(async () => 'Feature');
const mockDescription = jest.fn(async () => 'Human requirements');
const mockNativeRead = jest.fn(async () => ({ number: 42, state: 'open' as const, reason: 'unknown' as const, labels: ['feature', 'in-progress'] }));
const mockNativeFactory = jest.fn((_binding: unknown) => ({ readIssue: mockNativeRead, readPullRequest: mockWrite, addComment: mockWrite }));
const mockLabels = jest.fn(async () => ['feature', 'in-progress']);
const mockPermission = jest.fn(async () => true);
const mockWrite = jest.fn(() => { throw new Error('query must not mutate'); });
const mockHead = 'e'.repeat(40), mockBase = 'a'.repeat(40), mockFirst = 'b'.repeat(40);
const mockGraphql = jest.fn(async () => ({ repository: { ref: { target: { oid: mockHead } }, issue: { linkedBranches: { nodes: [{ ref: {
    name: 'feature/42', repository: { nameWithOwner: 'acme/demo' }, target: { oid: mockHead },
} }] } } } }));
const mockGetClient = jest.fn(() => ({ graphql: mockGraphql }));
const mockSnapshot = jest.fn(async (sha: string) => ({ baseSha: sha, template: '', standard: '', capabilities: [{
    id: 'feature', title: 'Feature', status: 'implemented', scope: 'Feature', owner: 'Maintainer', lastVerified: '2026-10-11',
    specs: ['specs/feature.md'], workflows: [], entrypoints: [], code: [], tests: [], documentation: [],
}] }));
const mockVerify = jest.fn(async () => true);
const mockAncestor = jest.fn(async () => true);

jest.mock('../issue_completion_composition_root', () => ({ createNativeStatusReadPort: (binding: unknown) => mockNativeFactory(binding) }));
jest.mock('../issue_metadata_composition_root', () => ({ createIssueMetadataCompositionRoot: () => ({ getTitle: mockTitle, setTitle: mockWrite }) }));
jest.mock('../issue_content_composition_root', () => ({ createIssueContentCompositionRoot: () => ({ getDescription: mockDescription, updateDescription: mockWrite }) }));
jest.mock('../issue_labels_composition_root', () => ({ createIssueLabelRepository: () => ({ getLabels: mockLabels, setLabels: mockWrite }) }));
jest.mock('../actor_authorization_composition_root', () => ({ createActorAuthorizationRepository: () => ({ isActorAllowedToModifyFiles: mockPermission }) }));
jest.mock('../github_project_client_factory', () => ({ createGraphqlTransportClient: () => ({ getClient: mockGetClient }) }));
jest.mock('../../pre_branch_sdd_workspace_adapter', () => ({ PreBranchSddWorkspaceAdapter: jest.fn(() => ({
    loadSnapshot: mockSnapshot, loadSnapshotAtCommit: mockSnapshot, verifyPublication: mockVerify, isAncestor: mockAncestor,
    publish: mockWrite, ensureBranch: mockWrite,
})) }));

describe('composed read-only SDD query', () => {
    it.each([undefined, 'https://github.acme.test'])('binds explicit or fallback server origin independently of runner environment: %s', serverOrigin => {
        const previous = process.env.GITHUB_SERVER_URL;
        try {
            if (serverOrigin === undefined) delete process.env.GITHUB_SERVER_URL;
            else process.env.GITHUB_SERVER_URL = serverOrigin;
            const query = createSddEvidenceQueryPort({ owner: 'acme', repository: 'demo', token: 'fixture-token' }, { listIssueComments: jest.fn() });
            expect(query.serverOrigin).toBe(serverOrigin ?? 'https://github.com');
        } finally {
            if (previous === undefined) delete process.env.GITHUB_SERVER_URL;
            else process.env.GITHUB_SERVER_URL = previous;
        }
    });
    it('binds historical branch reads while physically discarding writer capabilities', async () => {
        const ports = createSddEvidenceReadPorts({ owner: 'acme', repository: 'demo', token: 'fixture-token' }, { listIssueComments: jest.fn() });
        expect(Object.keys(ports.branches).sort()).toEqual(['getHistoricalLinkedBranch', 'getLinkedBranch']);
        expect(Object.isFrozen(ports.branches)).toBe(true);
        await expect(ports.branches.getHistoricalLinkedBranch!(42, 'feature/42')).resolves.toEqual({ name: 'feature/42', headSha: mockHead });
        expect(mockGetClient).toHaveBeenCalledWith('fixture-token');
        expect(mockWrite).not.toHaveBeenCalled();
    });
    it('reads owned publication and currently authorized answers with the bound repository identity while discarding mutation capabilities', async () => {
        const binding = { owner: 'acme', repository: 'demo', token: 'fixture-token' };
        const context = { issueNumber: 42, admittedKind: 'feature' as const, profileDigest: 'profile', issueAuthor: 'author',
            trustedBotLogin: 'vypbot', issueManagedBranches: true, preBranchSdd: true, baseBranch: 'develop' };
        const questionText = 'Which current behavior should be adopted?';
        const record: SddGateRecord = { version: 1, issueNumber: 42, phase: 'awaiting-answer', round: 2,
            issueDigest: buildSddIssueDigest({ issueNumber: 42, issueTitle: 'Feature', issueBody: 'Human requirements', admittedKind: 'feature', profileDigest: 'profile' }, mockBase),
            baseSha: mockBase, commitSha: mockFirst, branchName: 'feature/42',
            plan: { action: 'update', path: 'specs/feature.md', capabilityId: 'feature', reason: 'This capability owns the feature contract.',
                questions: [{ id: 'Q1', text: questionText, owner: 'maintainer' }] },
            answers: [{ questionId: 'Q1', author: 'maintainer', commentId: 6, text: 'Current authorized answer', round: 2, questionText }],
        };
        const listIssueComments = jest.fn(async () => ({ value: [{ id: 7, body: renderSddGateRecord(record), user: { login: 'vypbot' } }],
            coverage: { source: 'issue-comments' as const, status: 'complete' as const, pagesFetched: 1, itemsFetched: 1, itemsRetained: 1,
                omittedItems: 0, truncatedItems: 0, limitReached: false } }));
        const query = createSddEvidenceQueryPort(binding, { listIssueComments });
        expect(Object.isFrozen(query)).toBe(true);
        expect(Object.keys(query)).toEqual(['read', 'serverOrigin']);
        expect(query.serverOrigin).toBe(process.env.GITHUB_SERVER_URL ?? 'https://github.com');
        expect(await query.read(context)).toMatchObject({ state: 'publication-pending', pendingQuestionIds: [], verified: { firstSha: mockFirst, branchHeadSha: mockHead } });
        expect(mockTitle).toHaveBeenCalledWith('acme', 'demo', 42, 'fixture-token');
        expect(mockDescription).toHaveBeenCalledWith('acme', 'demo', 42, 'fixture-token');
        expect(mockNativeFactory).toHaveBeenCalledWith(binding);
        expect(mockNativeRead).toHaveBeenCalledWith(42);
        expect(mockLabels).not.toHaveBeenCalled();
        expect(mockPermission).toHaveBeenCalledWith('acme', 'demo', 'maintainer', 'fixture-token');
        expect(mockGetClient).toHaveBeenCalledWith('fixture-token');
        expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), { owner: 'acme', repository: 'demo', issueNumber: 42, ref: 'refs/heads/feature/42' });
        expect(mockSnapshot).toHaveBeenCalledWith(mockFirst);
        expect(mockVerify).toHaveBeenCalledWith('feature/42', mockBase, mockFirst, 'specs/feature.md');
        expect(mockWrite).not.toHaveBeenCalled();
    });
});
