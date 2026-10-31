import { ProgressDiffRepository } from '../progress_diff_repository';
import { objectFixture, BASE, HEAD, type FileMap } from './fixtures/progress_object_fixture';
import { logInfo } from '../../../application/ports/logging_ports';
jest.mock('../../../application/ports/logging_ports',()=>({logInfo:jest.fn()}));
function fixture(status:string,before:FileMap,after:FileMap,path='lib/a.dll',previous?:string){
    const objects=objectFixture(before,after);
    const compareCommits=jest.fn(async()=>({data:{base_commit:{sha:BASE},merge_base_commit:{sha:BASE},ahead_by:1,behind_by:0,total_commits:1,commits:[],files:[{filename:path,previous_filename:previous,status,additions:0,deletions:0,changes:0,blob_url:'PRIVATE_URL',raw_url:'PRIVATE_URL',contents_url:'PRIVATE_URL'}]}}));
    const repository=new ProgressDiffRepository({getClient:()=>({rest:{repos:{compareCommits}}})}as never,{getClient:()=>objects.client});
    return{...objects,read:()=>repository.getDiff('owner','repo',BASE,HEAD,'PRIVATE_TOKEN')};
}
beforeEach(()=>jest.clearAllMocks());
describe('binary evidence in the selected immutable comparison',()=>{
    it.each(['added','modified','removed','renamed'])('retains unavailable evidence for actual binary %s without a textual-patch substitute',async status=>{
        const old=Buffer.from([0,1]),next=Buffer.from([0,2]);
        const before:FileMap=status==='added'?{}:{[status==='renamed'?'old/a.dll':'lib/a.dll']:old};
        const after:FileMap=status==='removed'?{}:{'lib/a.dll':status==='renamed'?old:next};
        const f=fixture(status,before,after,'lib/a.dll',status==='renamed'?'old/a.dll':undefined);
        await expect(f.read()).rejects.toMatchObject({code:'validation.evidence-unavailable',retryable:false,recovery:{id:'progress-binary-evidence-unavailable',variables:{paths:'["lib/a.dll"]',pathCount:1}}});
        expect(jest.mocked(logInfo)).toHaveBeenCalledWith('Unreviewed progress path 1 of 1: `"lib/a.dll"`');
    });
    it('does not infer unchanged contents from zero statistics with different blob identities',async()=>{
        const f=fixture('modified',{'lib/a.dll':Buffer.from([0,1])},{'lib/a.dll':Buffer.from([0,2])});
        await expect(f.read()).rejects.toMatchObject({code:'validation.evidence-unavailable'});expect(f.getBlob).toHaveBeenCalledTimes(1);
    });
    it('reviews exact UTF-8 contents even when a path has a binary-looking extension',async()=>{
        const f=fixture('added',{}, {'lib/a.dll':'complete textual fixture'});const result=await f.read();
        if(result.kind!=='partitioned')throw Error('Expected content units');
        expect(result.partitions[0].evidence).toContain('complete textual fixture');expect(result.partitions[0].evidence).not.toContain('generated-metadata-only');
    });
    it('keeps the byte cap before classifying or downloading an oversized binary',async()=>{
        const f=fixture('added',{}, {'lib/a.dll':Buffer.alloc(2_097_153)});await expect(f.read()).rejects.toMatchObject({code:'validation.evidence-too-large'});expect(f.getBlob).not.toHaveBeenCalled();
    });
    it('still refuses binary content between the legacy and framed blob limits after immutable verification',async()=>{
        const f=fixture('added',{}, {'lib/a.dll':Buffer.alloc(1_048_577)});
        await expect(f.read()).rejects.toMatchObject({code:'validation.evidence-unavailable',recovery:{id:'progress-binary-evidence-unavailable'}});
        expect(f.getBlob).toHaveBeenCalledTimes(1);
    });
    it('retains genuine immutable-provider outages rather than claiming binary review',async()=>{
        const f=fixture('added',{}, {'lib/a.dll':Buffer.from([0,1])}),failure={status:500,message:'PRIVATE_PROVIDER'};f.getBlob.mockRejectedValue(failure);
        await expect(f.read()).rejects.toBe(failure);expect(jest.mocked(logInfo)).not.toHaveBeenCalled();
    });
});
