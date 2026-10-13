import { createPullRequestStatusReadPorts } from '../pull_request_status_composition_root';
import { PullRequestStatusQueryRepository } from '../../../data/repository/pull_request/pull_request_status_query_repository';
import { PullRequestApprovalRepository } from '../../../data/repository/pull_request/pull_request_approval_repository';
const mockLinks=jest.fn(),mockRevision=jest.fn(),mockPolicy=jest.fn(),mockEvidence=jest.fn();
jest.mock('../../../data/repository/pull_request/pull_request_status_query_repository',()=>({PullRequestStatusQueryRepository:jest.fn(()=>({readLinkedPullRequests:mockLinks,readRevision:mockRevision}))}));
jest.mock('../../../data/repository/pull_request/pull_request_approval_repository',()=>({PullRequestApprovalRepository:jest.fn(()=>({readPolicy:mockPolicy,loadEvidence:mockEvidence,submitApproval:jest.fn(),publishAssessment:jest.fn()}))}));
jest.mock('../../github_action_input',()=>({getGithubActionInput:jest.fn((key:string)=>(({'main-branch':'main','development-branch':'development','feature-tree':'features','bugbot-severity':'info','bugbot-dry-run':'true'} as Record<string,string>)[key]??''))}));
const binding={owner:'o',repository:'r',token:'runtime-token'};
const context={getPullRequest:jest.fn(),listIssueComments:jest.fn(),getPullRequestHeadSha:jest.fn()};
beforeEach(()=>jest.clearAllMocks());
describe('physically read-only readiness composition',()=>{
    it('binds only the runtime credential without eagerly reading any provider',()=>{
        createPullRequestStatusReadPorts(binding,context as never);
        expect(PullRequestStatusQueryRepository).toHaveBeenCalledWith('o','r','runtime-token');
        expect(PullRequestApprovalRepository).toHaveBeenCalledWith('runtime-token',expect.any(Object));
        expect(mockPolicy).not.toHaveBeenCalled();expect(mockEvidence).not.toHaveBeenCalled();
    });
    it('uses existing configured branch and Bugbot settings without introducing a policy override',()=>{
        createPullRequestStatusReadPorts(binding,context as never);
        expect(PullRequestApprovalRepository).toHaveBeenCalledWith('runtime-token',expect.objectContaining({mainBranch:'main',developmentBranch:'development',
            branchPrefixes:expect.objectContaining({feature:'features'}),bugbotSeverity:'info',bugbotDryRun:true}));
    });
    it('retains safe existing defaults when no branch or Bugbot setting was supplied',()=>{
        const {getGithubActionInput}=jest.requireMock('../../github_action_input') as {getGithubActionInput:jest.Mock};
        getGithubActionInput.mockImplementation(()=> '');
        try {
            createPullRequestStatusReadPorts(binding,context as never);
            expect(PullRequestApprovalRepository).toHaveBeenCalledWith('runtime-token',expect.objectContaining({mainBranch:'master',developmentBranch:'develop',
                branchPrefixes:{feature:'feature',bugfix:'bugfix',documentation:'docs',chore:'chore'},bugbotSeverity:'low',bugbotDryRun:false,bugbotIgnorePatterns:[]}));
        } finally { getGithubActionInput.mockImplementation((key:string)=>(({'main-branch':'main','development-branch':'development','feature-tree':'features','bugbot-severity':'info','bugbot-dry-run':'true'} as Record<string,string>)[key]??'')); }
    });
    it('exposes only frozen query methods and no observer mutations',()=>{
        const ports=createPullRequestStatusReadPorts(binding,context as never);
        expect(Object.keys(ports).sort()).toEqual(['approval','getPullRequest','getPullRequestHeadSha','listIssueComments','readLinkedPullRequests','serverOrigin']);
        expect(Object.keys(ports.approval!).sort()).toEqual(['loadEvidence','readPolicy','readRevision']);
        expect(Object.isFrozen(ports)).toBe(true);expect(Object.isFrozen(ports.approval)).toBe(true);
    });
    it('delegates exact identities to the bound queries and existing context receiver',async()=>{
        const ports=createPullRequestStatusReadPorts(binding,context as never); const target={owner:'o',repository:'r',repositoryId:1,pullNumber:11};
        await ports.getPullRequestHeadSha(11); await ports.listIssueComments(11); await ports.approval!.loadEvidence(target);
        await ports.getPullRequest(11);await ports.readLinkedPullRequests!(7);await ports.approval!.readRevision(target);await ports.approval!.readPolicy(target);
        expect(context.getPullRequestHeadSha).toHaveBeenCalledWith(11);expect(context.listIssueComments).toHaveBeenCalledWith(11);expect(mockEvidence).toHaveBeenCalledWith(target);
        expect(context.getPullRequest).toHaveBeenCalledWith(11);expect(mockLinks).toHaveBeenCalledWith(7);expect(mockRevision).toHaveBeenCalledWith(target);expect(mockPolicy).toHaveBeenCalledWith(target);
    });
});
