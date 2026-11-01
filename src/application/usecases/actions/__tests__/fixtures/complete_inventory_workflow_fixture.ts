import { CheckProgressUseCase } from '../../check_progress_use_case';
import { inventoryFixture, addedFiles, inventoryBase as base, inventoryHead as head } from '../../../../../data/repository/__tests__/support/immutable_progress_inventory_fixture';
import type { ProgressDiffEvidence } from '../../../../ports/progress_diff_query_ports';
import type { FindingsQueryRequest } from '../../../../ports/agent_findings_ports';
import type { ProgressPullRequestSource } from '../../../../ports/progress_comparison_source_ports';
import { AGENT_PROMPT_MAX_BYTES } from '../../../../../domain/agent_execution_plan';
import { buildAgentPrompt, applyAgentEffortInstruction } from '../../../../policies/agent_prompt_envelope_policy';
export const inventoryContext = { issueNumber:838,pushedBranch:'bugfix/838-work',developmentBranch:'develop',branchTypes:['bugfix'],
    agentConfiguration:{provider:'codex' as const,model:'fixture-model',effort:'low'},includeReasoning:false,targetLocale:'en-US' };
export function completeInventoryScenario(source = inventoryFixture({}, addedFiles()), owningPr = true) {
    let diff: ProgressDiffEvidence | undefined, partCount = 0;
    const state = { issue:'Supply the complete immutable source package.', base, head, open:true,
        native: (owningPr ? {kind:'pull-request',number:837,headSha:head,baseBranch:'develop'} : {kind:'none'}) as ProgressPullRequestSource };
    const setProgressLabel=jest.fn(),setLabels=jest.fn(),getDiff=jest.fn(async()=>{diff=await source.read();return diff;});
    const getSource=jest.fn(async()=>state.native);
    const captures: { request:FindingsQueryRequest; bytes:number }[]=[];
    const answer=async(request:FindingsQueryRequest):Promise<Record<string,unknown>>=>{
        expect(setProgressLabel).not.toHaveBeenCalled();expect(setLabels).not.toHaveBeenCalled();
        const bytes=Buffer.byteLength(applyAgentEffortInstruction(buildAgentPrompt(request.prompt,true,request.options!.schema,request.options!.schemaName!),inventoryContext.agentConfiguration.effort));
        expect(bytes).toBeLessThanOrEqual(AGENT_PROMPT_MAX_BYTES);captures.push({request,bytes});
        if(request.options?.schemaName==='progress_scope')return{outputLocale:'en-US',lines:[{id:'L1',kind:'required'}]};
        if(request.options?.schemaName==='progress_partition_facts'){
            if(diff?.kind!=='partitioned')throw Error('Expected complete inventory');
            const part=diff.partitions[partCount++];expect(request.prompt).toContain(part.evidence);
            const schema=request.options.schema as {properties:{partitionId:{enum:string[]}}};
            return {outputLocale:'en-US',partitionId:schema.properties.partitionId.enum[0],files:part.units!.map(unit=>({unitId:unit.id,path:unit.path,implemented:'Source present.',remaining:'Run unverified.'}))};
        }
        expect(partCount).toBe(diff?.kind==='partitioned'?diff.partitions.length:0);
        return{outputLocale:'en-US',progress:100,requirements:[{id:'R1',status:'supported',evidence:'source-only',summary:'Complete source supplied; execution is not attested.',remaining:null}]};
    };
    const query=jest.fn(answer);
    const useCase=new CheckProgressUseCase({getDescription:async()=>state.issue},{getLabels:async()=>[],setLabels},{setProgressLabel},
        {getListOfBranches:async()=>[]},{getOpenPullRequestNumbersByHeadBranch:async()=>[]},{query},
        {isIssueOpen:async()=>state.open,getBranchHeadSha:async branch=>branch==='develop'?state.base:state.head},{getDiff},{getSource});
    return{source,state,getSource,getDiff,query,answer,setProgressLabel,setLabels,captures,diff:()=>diff,parts:()=>partCount,invoke:()=>useCase.invoke(inventoryContext)};
}
