import * as github from '@actions/github';
import { PullRequestStatusQueryRepository } from '../pull_request_status_query_repository';
const mockGraphql=jest.fn(), mockGet=jest.fn(), mockGetRef=jest.fn();
jest.mock('@actions/github', () => ({ getOctokit: jest.fn(() => ({ graphql: mockGraphql, rest: { pulls: { get: mockGet }, git: { getRef: mockGetRef } } })) }));
const head='a'.repeat(40), base='b'.repeat(40);
const node=() => ({ number: 11, state: 'OPEN', repository: { databaseId: 1 }, headRepository: { databaseId: 1 } });
function links() { return { repository: { databaseId: 1, nameWithOwner: 'o/r', issue: { number: 7,
    closedByPullRequestsReferences: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [node()] } } } }; }
const target={ owner: 'o', repository: 'r', repositoryId: 1, pullNumber: 11 };
beforeEach(() => { jest.clearAllMocks(); mockGraphql.mockResolvedValue(links());
    mockGetRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: base } } });
    mockGet.mockResolvedValue({ data: { number: 11, base: { sha: base, ref: 'develop', repo: { id: 1 } }, head: { sha: head, repo: { id: 1 } } } }); });
describe('bounded native PR status query', () => {
    it('uses the current base branch instead of the cached PR base SHA', async () => {
        const advanced = 'c'.repeat(40);
        mockGetRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: advanced } } });
        expect(await new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).toMatchObject({ headSha: head, baseSha: advanced });
        expect(mockGetRef).toHaveBeenCalledWith({ owner: 'o', repo: 'r', ref: 'heads/develop' });
    });
    it.each([403, 404])('does not fall back to the cached base after a current-ref read fails with %s', async status => {
        mockGetRef.mockRejectedValue({ status });
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).rejects.toBeDefined();
    });
    it('rejects current-base evidence for another branch', async () => {
        mockGetRef.mockResolvedValue({ data: { ref: 'refs/heads/master', object: { type: 'commit', sha: base } } });
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).rejects.toThrow();
    });
    it('observes base movement across final revision reads even when PR metadata stays cached', async () => {
        const advanced = 'c'.repeat(40), newer = 'd'.repeat(40);
        mockGetRef.mockResolvedValueOnce({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: advanced } } })
            .mockResolvedValueOnce({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: newer } } });
        const repository = new PullRequestStatusQueryRepository('o','r','t');
        expect((await repository.readRevision(target)).baseSha).toBe(advanced);
        expect((await repository.readRevision(target)).baseSha).toBe(newer);
    });
    it('rejects malformed current-base commit evidence despite a valid cached PR base', async () => {
        mockGetRef.mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: 'abc' } } });
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).rejects.toThrow();
    });
    it('uses only the bound runtime credential', () => {
        new PullRequestStatusQueryRepository('o','r','runtime-token'); expect(github.getOctokit).toHaveBeenCalledWith('runtime-token');
    });
    it('returns one native same-repository link without branch or issue-number inference', async () => {
        const repo=new PullRequestStatusQueryRepository('o','r','token');
        expect(await repo.readLinkedPullRequests(7)).toEqual({ state:'available',repositoryId:1,issueNumber:7,numbers:[11] });
        expect(mockGraphql).toHaveBeenCalledWith(expect.stringContaining('closedByPullRequestsReferences(first: 100, includeClosedPrs: false)'), { owner:'o',repository:'r',issue:7 });
    });
    it('distinguishes complete empty linkage from an unavailable read', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences={ totalCount:0,pageInfo:{hasNextPage:false},nodes:[] };mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toMatchObject({state:'available',numbers:[]});
    });
    it('retains complete multiple links so the application can report ambiguity', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.nodes.push({...node(),number:12});response.repository.issue.closedByPullRequestsReferences.totalCount=2;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toMatchObject({state:'available',numbers:[11,12]});
    });
    it('refuses a partial native page even if its retained result is empty', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.pageInfo.hasNextPage=true;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses a provider count inconsistent with the retained nodes', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.totalCount=2;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses more than the fixed 100 native nodes', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.nodes=Array.from({length:101},(_,i)=>({...node(),number:i+1}));response.repository.issue.closedByPullRequestsReferences.totalCount=101;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses a response naming a different repository', async () => {
        const response=links();response.repository.nameWithOwner='other/r';mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses a response for another issue', async () => {
        const response=links();response.repository.issue.number=8;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses foreign base repository linkage', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.nodes[0].repository.databaseId=99;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses a foreign head repository', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.nodes[0].headRepository.databaseId=99;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('does not manufacture a unique candidate from duplicate provider nodes', async () => {
        const response=links();response.repository.issue.closedByPullRequestsReferences.nodes.push(node());response.repository.issue.closedByPullRequestsReferences.totalCount=2;mockGraphql.mockResolvedValue(response);
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('refuses null nodes and unavailable pagination', async () => {
        mockGraphql.mockResolvedValue({repository:{databaseId:1,nameWithOwner:'o/r',issue:{number:7,closedByPullRequestsReferences:{nodes:[null],totalCount:1,pageInfo:{hasNextPage:false}}}}});
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('maps denied reads to unavailable rather than verified absence', async () => {
        mockGraphql.mockRejectedValue({status:403});expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(7)).toEqual({state:'unavailable'});
    });
    it('rejects invalid issue identity before a provider call', async () => {
        expect(await new PullRequestStatusQueryRepository('o','r','t').readLinkedPullRequests(0)).toEqual({state:'unavailable'});expect(mockGraphql).not.toHaveBeenCalled();
    });
    it('returns only an exact repository, PR, head and base revision', async () => {
        expect(await new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).toEqual({repositoryId:1,pullNumber:11,headSha:head,baseSha:base});
    });
    it('refuses a scope-changing revision request before network access', async () => {
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision({...target,owner:'other'})).rejects.toThrow('unavailable');expect(mockGet).not.toHaveBeenCalled();
    });
    it('refuses a foreign final repository even for the requested PR number', async () => {
        mockGet.mockResolvedValue({data:{number:11,base:{sha:base,repo:{id:99}},head:{sha:head,repo:{id:1}}}});
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).rejects.toThrow('unavailable');
    });
    it('refuses an abbreviated final base revision', async () => {
        mockGet.mockResolvedValue({data:{number:11,base:{sha:'abc',repo:{id:1}},head:{sha:head,repo:{id:1}}}});
        await expect(new PullRequestStatusQueryRepository('o','r','t').readRevision(target)).rejects.toThrow('unavailable');
    });
});
