import { inventoryFixture as fixture, directoryHash, addedFiles, inventoryBase as base, inventoryHead as head } from './support/immutable_progress_inventory_fixture';
import { ImmutableProgressContentRepository } from '../immutable_progress_content_repository';
import { collectImmutableProgressInventory as collect } from '../immutable_progress_inventory_repository';
const reader = (f: ReturnType<typeof fixture>) => new ImmutableProgressContentRepository(f.client, 'acme', 'demo', 'immutable-tree-v1');
const read = (f: ReturnType<typeof fixture>) => collect(reader(f), base, head);

describe('complete immutable changed-path inventory', () => {
    it('collects every path beyond the capped prefix', async () => { const f=fixture({},addedFiles(887));expect(await read(f)).toHaveLength(887);expect(f.getBlob).not.toHaveBeenCalled(); });
    it('admits exactly 1024 changed paths', async () => { expect(await read(fixture({},addedFiles(1024)))).toHaveLength(1024); });
    it('rejects path 1025 with an honest lower-bound count', async () => { await expect(read(fixture({},addedFiles(1025)))).rejects.toMatchObject({retryable:false,recovery:{variables:{reason:'file-count',observedCount:1025,supportedLimit:1024,countKind:'at-least'}}}); });
    it('omits unchanged regular files', async () => { expect(await read(fixture({'same':'x'},{'same':'x'}))).toEqual([]); });
    it('prunes equal subtree objects without fetching their contents', async () => { const f=fixture({'same/a':'x','changed':'old'},{'same/a':'x','changed':'new'});expect((await read(f)).map(c=>c.path)).toEqual(['changed']);expect(f.getTree).toHaveBeenCalledTimes(2); });
    it('retains pure executable mode changes', async () => { const f=fixture({'mode':'x'},{'mode':{bytes:Buffer.from('x'),mode:'100755'}});expect(await read(f)).toMatchObject([{path:'mode',status:'modified'}]); });
    it('retains both paths of a rename without guessing correspondence', async () => { expect((await read(fixture({'old':'same'},{'new':'same'}))).map(c=>[c.path,c.status])).toEqual([['new','added'],['old','removed']]); });
    it('treats a copy as an added path while pruning the unchanged source', async () => { expect((await read(fixture({'old':'same'},{'old':'same','new':'same'}))).map(c=>c.path)).toEqual(['new']); });
    it('retains every removed file in a deleted directory', async () => { expect((await read(fixture({'old/a':'a','old/b':'b'},{}))).map(c=>c.path)).toEqual(['old/a','old/b']); });
    it('retains every added file in a new directory', async () => { expect((await read(fixture({},{'new/a':'a','new/b':'b'}))).map(c=>c.path)).toEqual(['new/a','new/b']); });
    it('handles a file replaced by a directory without losing either side', async () => { expect((await read(fixture({'item':'old'},{'item/child':'new'}))).map(c=>[c.path,c.status])).toEqual([['item','removed'],['item/child','added']]); });
    it('handles a directory replaced by a file without losing either side', async () => { expect((await read(fixture({'item/child':'old'},{'item':'new'}))).map(c=>[c.path,c.status])).toEqual([['item','added'],['item/child','removed']]); });
    it('keeps similarly named paths in different directories distinct', async () => { expect((await read(fixture({},{'a/name':'a','b/name':'b'}))).map(c=>c.path)).toEqual(['a/name','b/name']); });
    it('does not normalize case-sensitive paths', async () => { expect((await read(fixture({},{'A':'a','a':'b'}))).map(c=>c.path)).toEqual(['A','a']); });
    it('does not normalize Unicode path identity', async () => { expect((await read(fixture({},{'é':'a','e\u0301':'b'}))).map(c=>c.path)).toEqual(['e\u0301','é']); });
    it('rejects a truncated native directory', async () => { const f=fixture({},addedFiles());f.getTree.mockImplementation(async({tree_sha})=>({data:{sha:String(tree_sha),truncated:true,tree:f.trees.get(String(tree_sha))!}}));await expect(read(f)).rejects.toMatchObject({code:'validation.evidence-unavailable'}); });
    it('rejects a foreign native directory identity', async () => { const f=fixture({},addedFiles());f.getTree.mockImplementation(async({tree_sha})=>({data:{sha:'c'.repeat(40),truncated:false,tree:f.trees.get(String(tree_sha))!}}));await expect(read(f)).rejects.toThrow(); });
    it('detects omitted late entries under a copied valid root SHA', async () => { const f=fixture({},addedFiles());f.trees.get(f.headTree)!.pop();await expect(read(f)).rejects.toMatchObject({recovery:{variables:{reason:'inventory'}}}); });
    it('rejects native commit identity substitution', async () => { const f=fixture({},addedFiles());f.getCommit.mockImplementation(async()=>({data:{sha:'c'.repeat(40),tree:{sha:f.headTree}}}));await expect(read(f)).rejects.toThrow(); });
    it('preserves an actual provider authentication failure', async () => { const f=fixture({},addedFiles());const error=Object.assign(new Error('authentication'),{status:401});f.getTree.mockRejectedValue(error);await expect(read(f)).rejects.toBe(error); });
    it('preserves an actual provider rate-limit failure', async () => { const f=fixture({},addedFiles());const error=Object.assign(new Error('rate limit'),{status:429});f.getTree.mockRejectedValue(error);await expect(read(f)).rejects.toBe(error); });
    it('does not retry a deterministic missing immutable object', async () => { const f=fixture({},addedFiles());f.getTree.mockRejectedValue(Object.assign(new Error('missing'),{status:404}));await expect(read(f)).rejects.toMatchObject({retryable:false});expect(f.getTree).toHaveBeenCalledTimes(1); });
    it('shares directory caches with subsequent immutable content recovery', async () => { const f=fixture({},{'folder/a':'x'}),r=reader(f);const changes=await collect(r,base,head);const calls=f.getTree.mock.calls.length;const c=changes[0];await r.recoverInventory(base,c.path,c.before,c.after,[c.path]);expect(f.getTree).toHaveBeenCalledTimes(calls);expect(r.usage!.total.files).toBe(1); });
    it('keeps each complete result and change immutable', async () => { const result=await read(fixture({},{'a':'x'}));expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result[0])).toBe(true); });
    it('rejects a full path exceeding the independent UTF-8 path budget before any blob read',async()=>{
        const f=fixture({},{['x'.repeat(600)+'/'+'y'.repeat(600)]:'content'});await expect(read(f)).rejects.toMatchObject({recovery:{variables:{reason:'inventory'}}});expect(f.getBlob).not.toHaveBeenCalled();
    });
    it('rejects a seventeenth shared recovery epoch before the next directory request',async()=>{
        const f=fixture(),r=reader(f);for(let n=0;n<1024;n++)r.accountFile(['generated']);
        const hashes=Array.from({length:257},(_,n)=>{const entries=[{path:`file-${n}`,type:'blob',mode:'100644',sha:'a'.repeat(40),size:1}];const sha=directoryHash(entries);f.trees.set(sha,entries);return sha;});
        for(const sha of hashes.slice(0,256))await r.directory(sha,['generated']);
        await expect(r.directory(hashes[256],['generated'])).rejects.toMatchObject({recovery:{variables:{reason:'frames',observedCount:17,supportedLimit:16}}});expect(f.getTree).toHaveBeenCalledTimes(256);
    });
});
