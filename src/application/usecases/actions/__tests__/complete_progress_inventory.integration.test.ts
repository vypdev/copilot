import { createHash } from 'node:crypto';
import { completeInventoryScenario as scenario } from './fixtures/complete_inventory_workflow_fixture';
import { largeCompleteProgressFixture } from '../../../../data/repository/__tests__/support/large_complete_progress_fixture';
import { inventoryFixture, addedFiles } from '../../../../data/repository/__tests__/support/immutable_progress_inventory_fixture';
const unchanged=(f:ReturnType<typeof scenario>)=>{expect(f.setProgressLabel).not.toHaveBeenCalled();expect(f.setLabels).not.toHaveBeenCalled();};

it('assesses the complete 887-path 6503131-byte workload through bounded rounds before one publication',async()=>{
    const source=largeCompleteProgressFixture(), f=scenario(source);const result=(await f.invoke())[0];
    expect(result).toMatchObject({success:true,payload:{progress:100}});
    const diff=f.diff();if(diff?.kind!=='partitioned')throw Error('Expected complete inventory');
    expect(diff.protocol).toMatchObject({version:'immutable-tree-v1',unitCount:952,recovery:{total:{files:887,bytes:6503131}}});
    expect(diff.protocol!.requiredPaths).toHaveLength(887);expect(diff.partitions.length).toBeGreaterThan(16);expect(diff.partitions.length).toBeLessThanOrEqual(64);
    expect(f.parts()).toBe(diff.partitions.length);expect(f.query).toHaveBeenCalledTimes(diff.partitions.length+2);expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    expect(Buffer.byteLength(diff.evidence)).toBeLessThanOrEqual(256000);expect(f.captures.every(c=>c.bytes<=524288)).toBe(true);
    const units=diff.partitions.flatMap(part=>JSON.parse(part.evidence).changes) as {path:string;recoveredContent:{side:string;text:string}}[];
    for(const [side,files] of [['base',source.before],['head',source.after]] as const)for(const [path,text] of Object.entries(files)){
        const supplied=units.filter(unit=>unit.path===path&&unit.recoveredContent.side===side).map(unit=>unit.recoveredContent.text).join('');
        expect(createHash('sha256').update(supplied).digest('hex')).toBe(createHash('sha256').update(text).digest('hex'));
        expect(supplied.slice(-16)).toBe(text.slice(-16));
    }
    const final=f.captures.at(-1)!.request.prompt;expect(final).toContain('complete-immutable-tree-analysis-v1');expect(final).toContain('Run unverified.');
    expect(source.getBlob).toHaveBeenCalledTimes(947);expect(source.compareCommits).toHaveBeenCalledTimes(2);
},60000);
it('rejects corruption of the final recovered side after earlier epochs without invoking any model or publication',async()=>{
    const source=largeCompleteProgressFixture(true),f=scenario(source);expect((await f.invoke())[0]).toMatchObject({success:false});
    expect(source.getBlob).toHaveBeenCalledTimes(947);expect(f.query).not.toHaveBeenCalled();unchanged(f);
},60000);
it('supports a complete large inventory after proven absence of an owning PR',async()=>{const f=scenario(undefined,false);expect((await f.invoke())[0].success).toBe(true);expect(f.setProgressLabel).toHaveBeenCalledTimes(1);});
it('does not treat a failed native owner lookup as absence',async()=>{const f=scenario();f.getSource.mockRejectedValue(Error('native lookup failed'));expect((await f.invoke())[0].success).toBe(false);expect(f.getDiff).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();unchanged(f);});
it('rejects ambiguous native ownership before collecting evidence',async()=>{const f=scenario();f.state.native={kind:'ambiguous'};expect((await f.invoke())[0].success).toBe(false);expect(f.getDiff).not.toHaveBeenCalled();unchanged(f);});
it('does not assess a late binary that was absent from the capped prefix',async()=>{const f=scenario(inventoryFixture({},{...addedFiles(),'zz/private.bin':{bytes:Buffer.from([0,1])}}));expect((await f.invoke())[0].success).toBe(false);expect(f.query).not.toHaveBeenCalled();unchanged(f);});
it('does not assess any prefix when the canonical inventory exceeds its closed path capacity',async()=>{const f=scenario(inventoryFixture({},addedFiles(1025)));expect((await f.invoke())[0].success).toBe(false);expect(f.query).not.toHaveBeenCalled();expect(f.source.getBlob).not.toHaveBeenCalled();unchanged(f);});
it('does not publish partial facts when a model request is interrupted',async()=>{const f=scenario();f.query.mockImplementation(async request=>{if(request.options?.schemaName==='progress_partition_facts')throw Error('owned interruption');return f.answer(request);});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
it('rejects a wrong request identity returned by the model',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);return request.options?.schemaName==='progress_partition_facts'?{...response,partitionId:'foreign'}:response;});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
it('rejects omitted unit facts rather than inferring completion from the path list',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_partition_facts')(response.files as unknown[]).pop();return response;});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
it('rejects wrong-locale facts without publishing progress',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);return request.options?.schemaName==='progress_partition_facts'?{...response,outputLocale:'es-ES'}:response;});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
it('retains progress when the native head moves after final assessment',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.head='c'.repeat(40);return response;});expect((await f.invoke())[0]).toMatchObject({executed:false});unchanged(f);});
it('retains progress when the native base moves after final assessment',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.base='c'.repeat(40);return response;});expect((await f.invoke())[0]).toMatchObject({executed:false});unchanged(f);});
it('retains progress when the acceptance body changes during assessment',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.issue='Different scope.';return response;});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
it('retains progress when the issue closes during assessment',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.open=false;return response;});expect((await f.invoke())[0]).toMatchObject({executed:false});unchanged(f);});
it('retains progress when the exact native owning PR disappears',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.native={kind:'none'};return response;});expect((await f.invoke())[0]).toMatchObject({executed:false});unchanged(f);});
it('retains progress when the exact native owning PR is replaced',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);if(request.options?.schemaName==='progress_response')f.state.native={kind:'pull-request',number:999,baseBranch:'develop',headSha:f.state.head};return response;});expect((await f.invoke())[0]).toMatchObject({executed:false});unchanged(f);});
it('does not publish when the final assessment contract is invalid',async()=>{const f=scenario();f.query.mockImplementation(async request=>{const response=await f.answer(request);return request.options?.schemaName==='progress_response'?{...response,requirements:[]}:response;});expect((await f.invoke())[0].success).toBe(false);unchanged(f);});
