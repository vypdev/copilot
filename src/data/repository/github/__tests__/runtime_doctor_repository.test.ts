import { RuntimeDoctorRepository } from '../runtime_doctor_repository';
import { DOCTOR_REPOSITORY_PATHS } from '../../../../application/ports/github_runtime_doctor_ports';
const HEAD = 'a'.repeat(40);
const mockClient = { rest: { repos: { get: jest.fn(), getContent: jest.fn() }, git: { getRef: jest.fn() },
    issues: { get: jest.fn() }, actions: { getRepoVariable: jest.fn(), getOrgVariable: jest.fn() } }, graphql: jest.fn() };
jest.mock('@actions/github', () => ({ getOctokit: () => mockClient }));
const ref = () => ({ data: { object: { type: 'commit', sha: HEAD } } });
const branch = () => ({ name: 'feature/7', target: { oid: HEAD }, repository: { databaseId: 42, nameWithOwner: 'o/r' } });
const links = (nodes: unknown[] = [{ ref: branch() }]) => ({ repository: { databaseId: 42, nameWithOwner: 'o/r',
    issue: { number: 7, linkedBranches: { nodes, pageInfo: { hasNextPage: false } } } } });
beforeEach(() => {
    jest.resetAllMocks(); mockClient.rest.repos.get.mockResolvedValue({ data: { id: 42, default_branch: 'master' } });
    mockClient.rest.git.getRef.mockResolvedValue(ref());
    mockClient.rest.repos.getContent.mockImplementation(async ({ path }: { path: string }) => ({ data: { type: 'file', path,
        encoding: 'base64', content: Buffer.from('# Safe source').toString('base64') } }));
    mockClient.graphql.mockResolvedValue(links());
    mockClient.rest.issues.get.mockResolvedValue({ data: { number: 7, title: 'Safe', body: '', labels: [{ name: 'feature' }] } });
});
describe('bounded SDK doctor reads', () => {
    it('reads exactly the fixed paths at one verified default revision and fences the default head', async () => {
        const result = await new RuntimeDoctorRepository('o', 'r', 'SECRET').readRepository(42);
        expect(result.state).toBe('available'); expect(mockClient.rest.repos.getContent.mock.calls.map(([request]) => request.path)).toEqual(DOCTOR_REPOSITORY_PATHS);
        expect(mockClient.rest.repos.getContent.mock.calls.every(([request]) => request.ref === HEAD)).toBe(true);
        expect(mockClient.rest.git.getRef).toHaveBeenCalledTimes(2);
    });
    it('keeps denied repository reads unavailable without exposing diagnostics', async () => {
        mockClient.rest.repos.get.mockRejectedValue({ status: 403, message: 'SECRET' });
        expect(await new RuntimeDoctorRepository('o', 'r', 'SECRET').readRepository(42)).toEqual({ state: 'unavailable' });
    });
    it('rejects mismatched repository identity before content reads', async () => {
        expect(await new RuntimeDoctorRepository('o', 'r', 't').readRepository(43)).toEqual({ state: 'unavailable' });
        expect(mockClient.rest.repos.getContent).not.toHaveBeenCalled();
    });
    it('rejects unsafe default branch metadata', async () => {
        mockClient.rest.repos.get.mockResolvedValue({ data: { id: 42, default_branch: '../private' } });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42)).state).toBe('unavailable');
    });
    it('rejects non-commit default references', async () => {
        mockClient.rest.git.getRef.mockResolvedValue({ data: { object: { type: 'tag', sha: HEAD } } });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42)).state).toBe('unavailable');
    });
    it('rejects a changed default head after content reads', async () => {
        mockClient.rest.git.getRef.mockResolvedValueOnce(ref()).mockResolvedValueOnce({ data: { object: { type: 'commit', sha: 'b'.repeat(40) } } });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42)).state).toBe('unavailable');
    });
    it('retains proven missing files as missing rather than permission failures', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({ status: 404 });
        const result = await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42);
        expect(result).toMatchObject({ state: 'available', files: { 'specs/catalog.json': { state: 'missing' } } });
    });
    it('keeps a denied content sample unavailable rather than missing', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({ status: 403, message: 'SECRET' });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42)).state).toBe('unavailable');
    });
    it.each([
        { label: 'directory', response: [] },
        { label: 'foreign path', response: { type: 'file', path: '../private', encoding: 'base64', content: 'QQ==' } },
        { label: 'invalid base64', response: { type: 'file', path: DOCTOR_REPOSITORY_PATHS[0], encoding: 'base64', content: 'A=A=' } },
        { label: 'oversized file', response: { type: 'file', path: DOCTOR_REPOSITORY_PATHS[0], encoding: 'base64', content: Buffer.alloc(200_001).toString('base64') } },
        { label: 'invalid UTF-8', response: { type: 'file', path: DOCTOR_REPOSITORY_PATHS[0], encoding: 'base64', content: Buffer.from([255]).toString('base64') } },
    ])('rejects $label provider content', async ({ response }) => {
        mockClient.rest.repos.getContent.mockResolvedValue({ data: response });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42)).state).toBe('unavailable');
    });
    it('maps a native linked branch only after matching its current remote head', async () => {
        expect(await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).toEqual({ state: 'available', repositoryId: 42, name: 'feature/7', headSha: HEAD });
        expect(mockClient.rest.git.getRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/feature/7' });
    });
    it('distinguishes a complete empty native page from an unavailable page', async () => {
        mockClient.graphql.mockResolvedValue(links([])); expect(await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).toEqual({ state: 'absent' });
    });
    it('refuses incomplete native pagination', async () => {
        const result = links(); result.repository.issue.linkedBranches.pageInfo.hasNextPage = true; mockClient.graphql.mockResolvedValue(result);
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).state).toBe('unavailable');
    });
    it('refuses ambiguous native branch associations', async () => {
        mockClient.graphql.mockResolvedValue(links([{ ref: branch() }, { ref: branch() }]));
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).state).toBe('unavailable');
    });
    it('refuses cross-repository native links', async () => {
        mockClient.graphql.mockResolvedValue(links([{ ref: { ...branch(), repository: { databaseId: 43, nameWithOwner: 'other/r' } } }]));
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).state).toBe('unavailable');
    });
    it('refuses a native branch whose live ref moved', async () => {
        mockClient.rest.git.getRef.mockResolvedValue({ data: { object: { type: 'commit', sha: 'b'.repeat(40) } } });
        expect((await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).state).toBe('unavailable');
    });
    it('keeps failed native reads unavailable without PR or name fallbacks', async () => {
        mockClient.graphql.mockRejectedValue(new Error('SECRET')); expect(await new RuntimeDoctorRepository('o', 'r', 't').readLinkedBranch(7)).toEqual({ state: 'unavailable' });
    });
    it('maps a bounded exact issue without publishing its source text', async () => {
        expect(await new RuntimeDoctorRepository('o', 'r', 't').readIssue(7)).toEqual({ number: 7, title: 'Safe', body: '', labels: ['feature'] });
    });
    it.each([
        { number: 8, title: 'wrong', body: '', labels: [] },
        { number: 7, title: 'PR', body: '', labels: [], pull_request: {} },
        { number: 7, title: 'issue', body: 'x'.repeat(70_001), labels: [] },
        { number: 7, title: 'issue', body: '', labels: [{}] },
    ])('rejects malformed issue response %#', async data => {
        mockClient.rest.issues.get.mockResolvedValue({ data }); await expect(new RuntimeDoctorRepository('o', 'r', 't').readIssue(7)).rejects.toThrow('Malformed');
    });
    it('uses the canonical trusted policy reader without a local setup token', async () => {
        mockClient.rest.actions.getRepoVariable.mockResolvedValue({ data: { value: '{}' } });
        expect(await new RuntimeDoctorRepository('o', 'r', 't').readApprovalPolicy()).toEqual({ status: 'available', source: 'repository', value: '{}' });
    });
    it('retains authoritative absent policy after both existing precedence reads', async () => {
        mockClient.rest.actions.getRepoVariable.mockRejectedValue({ status: 404 }); mockClient.rest.actions.getOrgVariable.mockRejectedValue({ status: 404 });
        expect(await new RuntimeDoctorRepository('o', 'r', 't').readApprovalPolicy()).toEqual({ status: 'absent' });
    });
    it('never invents a policy source after permission or network failure', async () => {
        mockClient.rest.actions.getRepoVariable.mockRejectedValue(new Error('SECRET')); expect(await new RuntimeDoctorRepository('o', 'r', 't').readApprovalPolicy()).toEqual({ status: 'unavailable' });
        expect(mockClient.rest.actions.getOrgVariable).not.toHaveBeenCalled();
    });
});
