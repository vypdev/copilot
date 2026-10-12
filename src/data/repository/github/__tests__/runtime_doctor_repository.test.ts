import { RuntimeDoctorRepository } from '../runtime_doctor_repository';
import { DOCTOR_REPOSITORY_PATHS } from '../../../../application/ports/github_runtime_doctor_ports';
const HEAD = 'a'.repeat(40), TREE = 'c'.repeat(40);
const trackedTree = (paths: readonly string[] = DOCTOR_REPOSITORY_PATHS) => ({ data: { sha: TREE, truncated: false, tree: paths.map(path => ({ path, type: 'blob', sha: 'd'.repeat(40) })) } });
const mockClient = { rest: { repos: { get: jest.fn(), getContent: jest.fn() }, git: { getRef: jest.fn(), getCommit: jest.fn(), getTree: jest.fn() },
    issues: { get: jest.fn() }, actions: { getRepoVariable: jest.fn(), getOrgVariable: jest.fn() } }, graphql: jest.fn() };
jest.mock('@actions/github', () => ({ getOctokit: () => mockClient }));
const ref = () => ({ data: { object: { type: 'commit', sha: HEAD } } });
const branch = () => ({ name: 'feature/7', target: { oid: HEAD }, repository: { databaseId: 42, nameWithOwner: 'o/r' } });
const links = (nodes: unknown[] = [{ ref: branch() }]) => ({ repository: { databaseId: 42, nameWithOwner: 'o/r',
    issue: { number: 7, linkedBranches: { nodes, pageInfo: { hasNextPage: false } } } } });
beforeEach(() => {
    jest.resetAllMocks(); mockClient.rest.repos.get.mockResolvedValue({ data: { id: 42, default_branch: 'master' } });
    mockClient.rest.git.getRef.mockResolvedValue(ref());
    mockClient.rest.git.getCommit.mockResolvedValue({data:{sha:HEAD,tree:{sha:TREE}}}); mockClient.rest.git.getTree.mockResolvedValue(trackedTree());
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
        mockClient.rest.git.getTree.mockResolvedValue(trackedTree([]));
        const result = await new RuntimeDoctorRepository('o', 'r', 't').readRepository(42);
        expect(result).toMatchObject({ state: 'available', files: { 'specs/catalog.json': { state: 'missing' } } });
    });
    it('does not treat a concealed content 404 as absence when the immutable tree contains the file', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404});
        expect(await new RuntimeDoctorRepository('o','r','t').readRepository(42)).toEqual({state:'unavailable'});
    });
    it('keeps a denied absence proof unavailable', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); mockClient.rest.git.getCommit.mockRejectedValue({status:403,message:'SECRET'});
        expect(await new RuntimeDoctorRepository('o','r','t').readRepository(42)).toEqual({state:'unavailable'});
    });
    it('rejects a foreign commit identity during absence proof', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); mockClient.rest.git.getCommit.mockResolvedValue({data:{sha:'b'.repeat(40),tree:{sha:TREE}}});
        expect((await new RuntimeDoctorRepository('o','r','t').readRepository(42)).state).toBe('unavailable'); expect(mockClient.rest.git.getTree).not.toHaveBeenCalled();
    });
    it('rejects a foreign tree identity during absence proof', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); const tree=trackedTree([]); tree.data.sha='b'.repeat(40); mockClient.rest.git.getTree.mockResolvedValue(tree);
        expect((await new RuntimeDoctorRepository('o','r','t').readRepository(42)).state).toBe('unavailable');
    });
    it('requires a complete tree to prove absence', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); const tree=trackedTree([]); tree.data.truncated=true;mockClient.rest.git.getTree.mockResolvedValue(tree);
        expect((await new RuntimeDoctorRepository('o','r','t').readRepository(42)).state).toBe('unavailable');
    });
    it('shares one immutable absence proof across all fixed file reads', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404});mockClient.rest.git.getTree.mockResolvedValue(trackedTree([]));
        const result=await new RuntimeDoctorRepository('o','r','t').readRepository(42);
        expect(result.state).toBe('available'); expect(mockClient.rest.git.getCommit).toHaveBeenCalledTimes(1);expect(mockClient.rest.git.getTree).toHaveBeenCalledTimes(1);
        expect(mockClient.rest.git.getCommit).toHaveBeenCalledWith({owner:'o',repo:'r',commit_sha:HEAD});
        expect(mockClient.rest.git.getTree).toHaveBeenCalledWith({owner:'o',repo:'r',tree_sha:TREE,recursive:'1'});
    });
    it.each(['duplicate path','unsafe path','invalid SHA','invalid type'])('rejects %s in absence proof', async scenario => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); const tree=trackedTree();
        if(scenario==='duplicate path')tree.data.tree.push({...tree.data.tree[0]});
        if(scenario==='unsafe path')tree.data.tree[0].path='../private';
        if(scenario==='invalid SHA')tree.data.tree[0].sha='not-an-object';
        if(scenario==='invalid type')tree.data.tree[0].type='unknown';
        mockClient.rest.git.getTree.mockResolvedValue(tree);
        expect((await new RuntimeDoctorRepository('o','r','t').readRepository(42)).state).toBe('unavailable');
    });
    it('bounds complete absence-proof metadata to ten thousand entries', async () => {
        mockClient.rest.repos.getContent.mockRejectedValue({status:404}); mockClient.rest.git.getTree.mockResolvedValue(trackedTree(Array.from({length:10_001},(_,n)=>'src/'+n)));
        expect((await new RuntimeDoctorRepository('o','r','t').readRepository(42)).state).toBe('unavailable');
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
    it.each([
        { label: 'null association', nodes: [null] },
        { label: 'missing ref', nodes: [{}] },
        { label: 'null ref', nodes: [{ref: null}] },
        { label: 'unavailable ref mixed with a valid branch', nodes: [{ref: null}, {ref: branch()}] },
    ])('keeps $label unavailable rather than proven absent or unique', async ({nodes}) => {
        mockClient.graphql.mockResolvedValue(links(nodes));
        expect(await new RuntimeDoctorRepository('o','r','t').readLinkedBranch(7)).toEqual({state: 'unavailable'});
        expect(mockClient.rest.git.getRef).not.toHaveBeenCalled();
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
    it('normalizes a valid native null issue body while preserving independent issue metadata', async () => {
        mockClient.rest.issues.get.mockResolvedValue({data:{number:7,title:'Issue',body:null,labels:[{name:'help'}]}});
        expect(await new RuntimeDoctorRepository('o','r','t').readIssue(7)).toEqual({number:7,title:'Issue',body:'',labels:['help']});
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
