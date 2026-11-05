import { inventoryFixture, addedFiles } from '../../../data/repository/__tests__/support/immutable_progress_inventory_fixture';
import { bindProgressEvidence, frameProgressEvidence, validateFramedProgressEvidence as validate } from '../progress_evidence_protocol_policy';
import { framedProgressFactBounds, aggregateProgressReceipts, parseProgressPartitionReceipt } from '../progress_partition_receipt_policy';
import type { ProgressDiffEvidence } from '../../ports/progress_diff_query_ports';
type Multipart=Extract<ProgressDiffEvidence,{kind:'partitioned'}>;
let original:Multipart;
beforeAll(async()=>{const result=await inventoryFixture({},addedFiles(600)).read();if(result.kind!=='partitioned')throw Error();original=result;});
const clone=():any=>JSON.parse(JSON.stringify(original));
const bound=():Multipart=>bindProgressEvidence(original,'issue','scope','en-US') as Multipart;
const receipts=(diff:Multipart,prose='Source.',limit=600,factJsonBytes?:number)=>diff.partitions.map(part=>parseProgressPartitionReceipt({outputLocale:'en-US',partitionId:part.id,
    files:part.units!.map(unit=>({unitId:unit.id,path:unit.path,implemented:prose,remaining:prose}))},part,'en-US',limit,factJsonBytes));

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
    it('reserves at least sixteen code points per facts field', () => { expect(framedProgressFactBounds(bound(),384000).factLimit).toBeGreaterThanOrEqual(16); });
    it('rejects inadequate aggregate capacity before model admission', () => { expect(()=>framedProgressFactBounds(bound(),1000)).toThrow(); });
    it('projects the complete inventory once and binds every tuple to its exact returned path', () => {
        const diff = bound(), values = receipts(diff);
        const reordered = values.map(receipt => ({ ...receipt, files: [...receipt.files].reverse() }));
        const text = aggregateProgressReceipts(diff, reordered, 384000);
        const { analysis, protocol, sources } = JSON.parse(text);
        expect(analysis.kind).toBe('complete-immutable-tree-analysis-v1');
        expect(analysis.format.facts).toEqual(['unitId', 'requiredPathIndex', 'implemented', 'remaining']);
        expect(analysis.requiredPaths).toEqual(diff.protocol!.requiredPaths);
        expect(protocol.requiredPaths).toBeUndefined();
        expect(protocol.manifestDigest).toBe(diff.protocol!.manifestDigest);
        expect(sources.map((source: { requestId: string }) => source.requestId)).toEqual(values.map(receipt => receipt.requestId));
        expect(analysis.facts.map(([unitId, index, implemented, remaining]: [string, number, string, string]) =>
            ({ unitId, path: analysis.requiredPaths[index], implemented, remaining }))).toEqual(reordered.flatMap(receipt => receipt.files));
        expect(text).not.toContain('recoveredContent');
    });
    it('admits 21-code-point facts with the same constrained budget that previously admitted 19', () => {
        const diff = bound(), budget = 201_200;
        const { factLimit: limit, factJsonBytes } = framedProgressFactBounds(diff, budget);
        const fact = 'Falta probar el flujo';
        expect([...fact]).toHaveLength(21);
        expect(limit).toBeGreaterThanOrEqual(21);
        const text = aggregateProgressReceipts(diff, receipts(diff, fact, limit, factJsonBytes), budget);
        expect(Buffer.byteLength(text)).toBeLessThanOrEqual(budget);
        expect(JSON.parse(text).analysis.facts).toHaveLength(600);
    });
    it('admits 42-code-point facts and exact UTF-8 boundaries within the original 24-point byte allocation', () => {
        const diff = bound();
        const withSingleByteFacts = aggregateProgressReceipts(diff, receipts(diff, 'x'), 384000);
        const budget = Buffer.byteLength(withSingleByteFacts) + 600 * 2 * (24 * 6 - 1);
        const { factLimit, factJsonBytes } = framedProgressFactBounds(diff, budget);
        expect({ factLimit, factJsonBytes }).toEqual({ factLimit: 144, factJsonBytes: 144 });
        const prose = 'Platform test timeouts extended for checks';
        expect([...prose]).toHaveLength(42);
        for (const fact of [prose, 'x'.repeat(factLimit), '🧪'.repeat(factJsonBytes! / 4)]) {
            const text = aggregateProgressReceipts(diff, receipts(diff, fact, factLimit, factJsonBytes), budget);
            expect(Buffer.byteLength(text)).toBeLessThanOrEqual(budget);
        }
    });
    it('admits the original worst-case escaped fact and rejects an overflow before forming a receipt', () => {
        const diff = bound(), budget = 384000;
        const { factLimit, factJsonBytes } = framedProgressFactBounds(diff, budget);
        const escapedLimit = Math.floor(factJsonBytes! / 6);
        const text = aggregateProgressReceipts(diff, receipts(diff, '\u0001'.repeat(escapedLimit), factLimit, factJsonBytes), budget);
        expect(Buffer.byteLength(text)).toBeLessThanOrEqual(budget);
        expect(escapedLimit + 1).toBeLessThanOrEqual(factLimit);
        for (const fact of ['\u0001'.repeat(escapedLimit + 1), '🧪'.repeat(Math.floor(factJsonBytes! / 4) + 1)]) {
            expect(() => receipts(diff, fact, factLimit, factJsonBytes)).toThrow(expect.objectContaining({
                recovery: { id: 'progress-result-contract-invalid', variables: expect.objectContaining({ phase: 'partition',
                    reason: 'partition-facts-invalid', field: '$.files[0].implemented' }) },
            }));
        }
    });
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
