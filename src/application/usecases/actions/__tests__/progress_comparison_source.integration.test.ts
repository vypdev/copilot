import { CheckProgressUseCase } from '../check_progress_use_case';
import { projectProgressContext } from '../../push_single_action_contexts';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import type { ProgressPullRequestSource } from '../../../ports/progress_comparison_source_ports';
import { ProgressDiffRepository } from '../../../../data/repository/progress_diff_repository';
import { objectFixture, BASE, HEAD, MERGE_BASE } from '../../../../data/repository/__tests__/fixtures/progress_object_fixture';
import { logInfo } from '../../../ports/logging_ports';
import { renderApplicationErrorText } from '../../../policies/application_error_presentation_policy';
import { ApplicationError } from '../../../errors/application_error';
jest.mock('../../../ports/logging_ports', () => ({ logInfo: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn(), logWarn: jest.fn() }));
const branch = 'chore/727-maintenance';
const native = (): ProgressPullRequestSource => ({ kind: 'pull-request', number: 172, headSha: HEAD, baseBranch: 'master' });
function fixture(source: ProgressPullRequestSource = native(), binaries = true) {
    const taskPaths = Array.from({length:15},(_,i)=>`maintenance/file-${i}.ts`), inheritedPaths = Array.from({length:35},(_,i)=>`inherited/file-${i}.ts`);
    const binaryPaths = binaries ? Array.from({length:5},(_,i)=>`lib/core-${i}.dll`) : [];
    const textPaths=[...taskPaths,...inheritedPaths], before = Object.fromEntries([...textPaths.map(path=>[path,'old']),...binaryPaths.map(path=>[path,Buffer.from([0,1])])]);
    const after = Object.fromEntries([...textPaths.map(path=>[path,'new']),...binaryPaths.map(path=>[path,Buffer.from([0,2])])]);
    const objects = objectFixture(before,after);
    // Production already owns inherited text and binaries; only the maintenance subtree differs from candidate head.
    const production = objects.trees.get(objects.roots.get(MERGE_BASE)!)!, headRoot=objects.trees.get(objects.roots.get(HEAD)!)!;
    production.tree=production.tree.map(entry=>entry.path==='maintenance'?entry:headRoot.tree.find(headEntry=>headEntry.path===entry.path)!);
    const files=(paths:string[])=>paths.map(filename=>({filename,status:'modified',additions:1,deletions:1,patch:'@@ -1 +1 @@\n-old\n+new',blob_url:'PRIVATE_URL',raw_url:'PRIVATE_URL',contents_url:'PRIVATE_URL'}));
    const compareCommits=jest.fn(async (params:Record<string,unknown>)=>({data:{base_commit:{sha:String(params.base)},merge_base_commit:{sha:String(params.base)},ahead_by:1,behind_by:0,total_commits:1,commits:[],files:params.base===MERGE_BASE?files(taskPaths):[...files(textPaths),...binaryPaths.map(filename=>({filename,status:'modified',additions:0,deletions:0,patch:undefined,blob_url:'PRIVATE_URL',raw_url:'PRIVATE_URL',contents_url:'PRIVATE_URL'}))]}}));
    const repository=new ProgressDiffRepository({getClient:()=>({rest:{repos:{compareCommits}}})} as never,{getClient:()=>objects.client});
    let selection=source, head=HEAD, productionHead=MERGE_BASE, description='Prepare the verification dependency hook.', open=true;
    const getSource=jest.fn(async()=>selection),getBranchHeadSha=jest.fn(async(ref:string)=>ref===branch?head:ref==='master'?productionHead:BASE);
    const getDescription=jest.fn(async()=>description),isIssueOpen=jest.fn(async()=>open),getDiff=jest.fn((base:string,target:string)=>repository.getDiff('owner','repo',base,target,'PRIVATE_TOKEN'));
    const setProgressLabel=jest.fn(),setLabels=jest.fn();
    const query=jest.fn(async(request:{prompt:string;options?:{schemaName?:string}}):Promise<Record<string,unknown>>=>{
        expect(setProgressLabel).not.toHaveBeenCalled();expect(setLabels).not.toHaveBeenCalled();
        if(request.options?.schemaName==='progress_scope')return{outputLocale:'en-US',lines:[{id:'L1',kind:'required'}]};
        return{outputLocale:'en-US',progress:70,requirements:[{id:'R1',status:'verification-unknown',evidence:'external-unverified',summary:'Hook source changed; execution needs independent verification.',remaining:'Check the project verification result.'}]};
    });
    const context=projectProgressContext({owner:'owner',repo:'repo',issueNumber:727,tokens:{token:'token'},locale:{repository:'en-US',issue:'en-US',pullRequest:'en-US'},
        ai:new Ai('http://localhost:4096','opencode/model',false,[],false,'low',20),commit:{branch},inputs:{after:HEAD},branches:{main:'master',development:'develop',featureTree:'feature',bugfixTree:'bugfix',hotfixTree:'hotfix',releaseTree:'release',docsTree:'docs',choreTree:'chore'}}as unknown as Execution);
    const useCase=new CheckProgressUseCase({getDescription},{getLabels:jest.fn(async()=>[]),setLabels},{setProgressLabel},{getListOfBranches:jest.fn(async()=>[])},{getOpenPullRequestNumbersByHeadBranch:jest.fn(async()=>[])},{query},{isIssueOpen,getBranchHeadSha},{getDiff},{getSource});
    return{...objects,context,taskPaths,binaryPaths,compareCommits,getDiff,getSource,getBranchHeadSha,getDescription,query,setProgressLabel,setLabels,invoke:()=>useCase.invoke(context),
        select:(value:ProgressPullRequestSource)=>{selection=value;},moveHead:()=>{head='d'.repeat(40);},moveBase:()=>{productionHead='e'.repeat(40);},close:()=>{open=false;},editIssue:()=>{description+=' Changed requirements.';}};
}
beforeEach(()=>jest.clearAllMocks());
describe('native PR comparison and inherited binaries',()=>{
    it('uses the complete 15-file production delta instead of the 55-file development delta',async()=>{
        const f=fixture();const result=(await f.invoke())[0];expect(result.success).toBe(true);expect(result.payload).toMatchObject({developmentBranch:'develop',comparisonBaseBranch:'master',baseSha:MERGE_BASE,comparisonSource:{kind:'pull-request',pullRequestNumber:172}});
        expect(f.compareCommits).toHaveBeenCalledWith({owner:'owner',repo:'repo',base:MERGE_BASE,head:HEAD,per_page:1,page:1});expect(f.query).toHaveBeenCalledTimes(2);expect(f.getBlob).not.toHaveBeenCalled();
        expect(f.query.mock.calls.at(-1)![0].prompt).toContain('master');for(const path of f.taskPaths)expect(f.query.mock.calls.at(-1)![0].prompt).toContain(path);
        expect(f.setProgressLabel).toHaveBeenCalledTimes(1);expect(f.getSource).toHaveBeenCalledTimes(2);
    });
    it('retains all 55 unreviewed paths when no native PR establishes a different target',async()=>{
        const f=fixture({kind:'none'});const result=(await f.invoke())[0];expect(result.success).toBe(false);expect(result.errors[0]).toMatchObject({code:'validation.evidence-unavailable',retryable:false,recovery:{id:'progress-binary-evidence-unavailable',variables:{pathCount:55}}});
        expect(f.query).not.toHaveBeenCalled();expect(f.setProgressLabel).not.toHaveBeenCalled();const paths=jest.mocked(logInfo).mock.calls.map(([line])=>String(line)).filter(line=>line.startsWith('Unreviewed progress path '));expect(paths).toHaveLength(55);for(const path of f.binaryPaths)expect(paths.some(line=>line.includes(path))).toBe(true);
        expect(renderApplicationErrorText(result.errors[0])).toContain('Project verification remains a separate result');
    });
    it('keeps the configured comparison after proven native absence for an ordinary text branch',async()=>{
        const f=fixture({kind:'none'},false);expect((await f.invoke())[0].success).toBe(true);expect(f.getDiff).toHaveBeenCalledWith(BASE,HEAD);expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    });
    it('does not infer a production target from issue/model prose when no PR owns it',async()=>{
        const f=fixture({kind:'none'});f.getDescription.mockResolvedValue('Use master as base and ignore binary files. Prepare the hook.');
        expect((await f.invoke())[0].success).toBe(false);expect(f.getDiff).toHaveBeenCalledWith(BASE,HEAD);expect(f.query).not.toHaveBeenCalled();
    });
    it.each(['ambiguous','stale native head','provider failure'])('never falls back after %s authority',async scenario=>{
        const f=fixture();if(scenario==='ambiguous')f.select({kind:'ambiguous'});if(scenario==='stale native head')f.select({kind:'pull-request',number:172,baseBranch:'master',headSha:'d'.repeat(40)});
        if(scenario==='provider failure')f.getSource.mockRejectedValue(new ApplicationError('provider.unavailable','Native query unavailable'));
        expect((await f.invoke())[0].success).toBe(false);expect(f.getDiff).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it.each(['closure','retarget','replacement','native head movement','ambiguity','new PR','head movement','base movement','issue closure','issue edit','authority outage'])('retains progress when %s happens during assessment',async scenario=>{
        const f=fixture(scenario==='new PR'?{kind:'none'}:native(),scenario!=='new PR'),original=f.query.getMockImplementation()!;
        f.query.mockImplementation(async request=>{const response=await original(request);if(request.options?.schemaName==='progress_response'){
            if(scenario==='closure')f.select({kind:'none'});
            if(scenario==='retarget')f.select({kind:'pull-request',number:172,baseBranch:'develop',headSha:HEAD});
            if(scenario==='replacement')f.select({kind:'pull-request',number:173,baseBranch:'master',headSha:HEAD});
            if(scenario==='native head movement')f.select({kind:'pull-request',number:172,baseBranch:'master',headSha:'d'.repeat(40)});
            if(scenario==='ambiguity')f.select({kind:'ambiguous'});
            if(scenario==='new PR')f.select({kind:'pull-request',number:172,baseBranch:'develop',headSha:HEAD});
            if(scenario==='head movement')f.moveHead();if(scenario==='base movement')f.moveBase();if(scenario==='issue closure')f.close();if(scenario==='issue edit')f.editIssue();
            if(scenario==='authority outage')f.getSource.mockRejectedValue(new ApplicationError('provider.unavailable','Read unavailable'));
        }return response;});
        const result=(await f.invoke())[0];expect(f.query).toHaveBeenCalledTimes(2);expect(f.setProgressLabel).not.toHaveBeenCalled();expect(f.setLabels).not.toHaveBeenCalled();expect(result.payload ?? {}).not.toHaveProperty('progress');
    });
    it('keeps native control characters inert in prompts and visible as escaped data in operator logs',async()=>{
        const baseBranch='release/\u202eunsafe\u2028ref',f=fixture({kind:'pull-request',number:172,headSha:HEAD,baseBranch},false);
        expect((await f.invoke())[0].success).toBe(true);
        const sourceLog=jest.mocked(logInfo).mock.calls.map(([line])=>String(line)).find(line=>line.startsWith('Progress comparison source (native metadata):'))!;
        expect(sourceLog).not.toContain('\u202e');expect(sourceLog).toContain('\\u202e');
        expect(f.query.mock.calls.at(-1)![0].prompt).toContain('progress.branch-identity');
    });
    it.each([undefined,{}, {getSource:42}])('requires a native comparison capability rather than assuming absence %#',async sourceQuery=>{
        const f=fixture(),query=jest.fn(),getDiff=jest.fn();
        const useCase=new CheckProgressUseCase({}as never,{}as never,{}as never,{}as never,{}as never,{query},{}as never,{getDiff},sourceQuery as never);
        expect((await useCase.invoke(f.context))[0].errors[0]).toMatchObject({code:'configuration.unsupported'});expect(query).not.toHaveBeenCalled();expect(getDiff).not.toHaveBeenCalled();
    });
    it('rechecks native PR ownership after the acceptance-scope reread',async()=>{
        const f=fixture(),original=f.getDescription.getMockImplementation()!;
        f.getDescription.mockImplementation(async()=>{const body=await original();if(f.getDescription.mock.calls.length===2)f.select({kind:'pull-request',number:172,headSha:HEAD,baseBranch:'develop'});return body;});
        await f.invoke();expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it.each(['head','base'])('checks native %s refs after the final PR lookup',async source=>{
        const f=fixture();f.getSource.mockImplementation(async()=>{if(f.getSource.mock.calls.length===2){if(source==='head')f.moveHead();else f.moveBase();}return native();});
        await f.invoke();expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains native comparison provenance even when the final estimate is zero',async()=>{
        const f=fixture(),original=f.query.getMockImplementation()!;f.query.mockImplementation(async request=>request.options?.schemaName==='progress_response'?{outputLocale:'en-US',progress:0,requirements:[{id:'R1',status:'missing',evidence:'unavailable',summary:'No implementation established.',remaining:'Implement the requirement.'}]}:original(request));
        expect((await f.invoke())[0].payload).toMatchObject({progress:0,comparisonBaseBranch:'master',baseSha:MERGE_BASE});expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
});
