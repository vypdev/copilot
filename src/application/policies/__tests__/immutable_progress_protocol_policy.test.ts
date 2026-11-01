import { inventoryFixture, addedFiles } from '../../../data/repository/__tests__/support/immutable_progress_inventory_fixture';
import { bindProgressEvidence, frameProgressEvidence, validateFramedProgressEvidence as validate } from '../progress_evidence_protocol_policy';
import { framedProgressFactLimit, aggregateProgressReceipts, parseProgressPartitionReceipt } from '../progress_partition_receipt_policy';
import type { ProgressDiffEvidence } from '../../ports/progress_diff_query_ports';
type Multipart=Extract<ProgressDiffEvidence,{kind:'partitioned'}>;
let original:Multipart;
beforeAll(async()=>{const result=await inventoryFixture({},addedFiles(600)).read();if(result.kind!=='partitioned')throw Error();original=result;});
const clone=():any=>JSON.parse(JSON.stringify(original));
const bound=():Multipart=>bindProgressEvidence(original,'issue','scope','en-US') as Multipart;
const receipts=(diff:Multipart,prose='Source.')=>diff.partitions.map(part=>parseProgressPartitionReceipt({outputLocale:'en-US',partitionId:part.id,
    files:part.units!.map(unit=>({unitId:unit.id,path:unit.path,implemented:prose,remaining:prose}))},part,'en-US',600));

function reframe(edit:(diff:any)=>void):()=>unknown {
    const diff=clone();edit(diff);
    const changes=diff.partitions.flatMap((part:any)=>JSON.parse(part.evidence).changes);
    return ()=>frameProgressEvidence(diff,diff.protocol.preimageSha,changes,diff.protocol.requiredPaths,diff.protocol.recovery,diff.protocol.attemptId,'immutable-tree-v1');
}
describe('complete immutable source and receipt protocol', () => {
    it('admits the complete new-profile inventory above legacy path and unit ceilings', () => { expect(()=>validate(original)).not.toThrow();expect(original.protocol!.requiredPaths).toHaveLength(600);expect(original.protocol!.unitCount).toBe(600); });
    it('limits every source part to 512 evidence units even when small text would fit', () => { expect(original.partitions.length).toBe(2);expect(original.partitions.map(p=>p.units!.length)).toEqual([512,88]); });
    it('retains rich metadata inside the full source parts', () => { expect(original.partitions[0].units![0].content).toHaveProperty('head');expect(original.partitions[0].evidence).toContain('export const value0'); });
    it('uses only digest-bound compact references in the top-level manifest', () => { const manifest=JSON.parse(original.evidence);expect(manifest.partitions[0]).not.toHaveProperty('paths');expect(manifest.partitions[0].units[0]).toEqual([original.partitions[0].units![0].id,0]);expect(manifest).not.toHaveProperty('text'); });
    it('rejects relabeling the new source as the old protocol', () => { const d=clone();d.protocol.version='framed-v1';expect(()=>validate(d)).toThrow(); });
    it('rejects unknown future profile versions', () => { const d=clone();d.protocol.version='immutable-tree-v2';expect(()=>validate(d)).toThrow(); });
    it('requires recovery usage for the new immutable route', () => { const d=clone();d.protocol.recovery=null;expect(()=>validate(d)).toThrow(); });
    it('rejects a seventeenth recovery epoch', () => { const d=clone();d.protocol.recovery.frames=17;expect(()=>validate(d)).toThrow(); });
    it('rejects more than 1024 canonical paths even in a forged manifest', () => { const d=clone();d.protocol.requiredPaths=Array.from({length:1025},(_,i)=>`file-${i}`);expect(()=>validate(d)).toThrow(); });
    it('rejects more than 4096 complete source units', () => { const d=clone();d.protocol.unitCount=4097;expect(()=>validate(d)).toThrow(); });
    it('rejects source omission at the protocol boundary', () => { const d=clone();d.partitions.pop();expect(()=>validate(d)).toThrow(); });
    it('rejects source reordering at the protocol boundary', () => { const d=clone();d.partitions.reverse();expect(()=>validate(d)).toThrow(); });
    it('rejects source duplication at the protocol boundary', () => { const d=clone();d.partitions[1]=d.partitions[0];expect(()=>validate(d)).toThrow(); });
    it('rejects a modified source text under the original digest', () => { const d=clone();d.partitions[0].evidence=d.partitions[0].evidence.replace('value0','other0');expect(()=>validate(d)).toThrow(); });
    it('rejects compact-index tampering under the original manifest digest', () => { const d=clone(),m=JSON.parse(d.evidence);m.partitions[0].units[0][1]=1;d.evidence=JSON.stringify(m);expect(()=>validate(d)).toThrow(); });
    it('rejects invented line statistics in source evidence', () => { const d=clone(),p=JSON.parse(d.partitions[0].evidence);p.changes[0].additions=0;d.partitions[0].evidence=JSON.stringify(p);expect(()=>validate(d)).toThrow(); });
    it('binds new-profile request identity to the full issue', () => { const other=bindProgressEvidence(original,'changed issue','scope','en-US') as Multipart;expect(other.partitions[0].id).not.toBe(bound().partitions[0].id); });
    it('binds new-profile request identity to the acceptance scope', () => { const other=bindProgressEvidence(original,'issue','changed scope','en-US') as Multipart;expect(other.partitions[0].id).not.toBe(bound().partitions[0].id); });
    it('binds new-profile request identity to the target locale', () => { const other=bindProgressEvidence(original,'issue','scope','es-ES') as Multipart;expect(other.partitions[0].id).not.toBe(bound().partitions[0].id); });
    it('reserves at least sixteen code points per facts field', () => { expect(framedProgressFactLimit(bound(),384000)).toBeGreaterThanOrEqual(16); });
    it('rejects inadequate aggregate capacity before model admission', () => { expect(()=>framedProgressFactLimit(bound(),1000)).toThrow(); });
    it('projects validated exact-path facts into compact explicit unit tuples', () => { const d=bound(),text=aggregateProgressReceipts(d,receipts(d),384000);const final=JSON.parse(text);expect(final.analysis.kind).toBe('complete-immutable-tree-analysis-v1');expect(final.analysis.facts).toHaveLength(600);expect(final.analysis.assignments[0]).toEqual([d.partitions[0].units![0].id,0]);expect(text).not.toContain('recoveredContent'); });
    it('admits worst-case JSON escaping within the preflight facts budget', () => { const d=bound(),limit=framedProgressFactLimit(d,384000),text=aggregateProgressReceipts(d,receipts(d,'\u0001'.repeat(limit)),384000);expect(Buffer.byteLength(text)).toBeLessThanOrEqual(384000); });
    it('rejects omitted receipt sets at aggregation', () => { const d=bound();expect(()=>aggregateProgressReceipts(d,receipts(d).slice(1),384000)).toThrow(); });
    it('rejects reordered receipt sets at aggregation', () => { const d=bound();expect(()=>aggregateProgressReceipts(d,receipts(d).reverse(),384000)).toThrow(); });
    it('rejects duplicate receipt identities at aggregation', () => { const d=bound(),r=receipts(d);expect(()=>aggregateProgressReceipts(d,[r[0],r[0]],384000)).toThrow(); });
    it('rejects a foreign returned unit path before compact projection', () => { const d=bound(),r=JSON.parse(JSON.stringify(receipts(d)));r[0].files[0].path='foreign';expect(()=>aggregateProgressReceipts(d,r,384000)).toThrow(); });
    it('rejects a response from a different issue context', () => { const d=bound(),foreign=bindProgressEvidence(original,'other issue','scope','en-US') as Multipart;expect(()=>aggregateProgressReceipts(d,receipts(foreign),384000)).toThrow(); });
    it('rejects a missing unit within a valid request identity', () => { const d=bound(),r=JSON.parse(JSON.stringify(receipts(d)));r[0].files.pop();expect(()=>aggregateProgressReceipts(d,r,384000)).toThrow(); });
    it('rejects surplus facts even if every path is otherwise known', () => { const d=bound(),r=JSON.parse(JSON.stringify(receipts(d)));r[0].files.push(r[0].files[0]);expect(()=>aggregateProgressReceipts(d,r,384000)).toThrow(); });
    it('rejects malformed source identity during independent aggregation', () => { const d=JSON.parse(JSON.stringify(bound()));d.partitions[0].sourceIdentity.digest='0'.repeat(64);expect(()=>aggregateProgressReceipts(d,receipts(d),384000)).toThrow(); });
    it('preserves uncertainty and denies build attestation in compact final facts', () => { const d=bound(),text=aggregateProgressReceipts(d,receipts(d),384000);expect(text).toContain('Preserve uncertainty');expect(text).toContain('not build, test or review attestation'); });
    it('rejects unitless new-profile sources even when all outer identities were consistently recomputed',()=>{
        expect(reframe(diff=>{for(const part of diff.partitions){delete part.units;const body=JSON.parse(part.evidence);for(const change of body.changes)delete change.unitId;part.evidence=JSON.stringify(body);}})).toThrow('(source-part-units)');
    });
    it('rejects invented zero line counts even under consistently recomputed outer identities',()=>{
        expect(reframe(diff=>{const part=diff.partitions[0],body=JSON.parse(part.evidence);body.changes[0].additions=0;part.evidence=JSON.stringify(body);})).toThrow('(source-part-units)');
    });
    it('rejects a changed blob even when compact references and every outer source digest are recomputed',()=>{
        expect(reframe(diff=>{const part=diff.partitions[0],body=JSON.parse(part.evidence);body.changes[0].recoveredContent.text=body.changes[0].recoveredContent.text.replace('value0','other0');part.evidence=JSON.stringify(body);})).toThrow('(source-coverage)');
    });
});
