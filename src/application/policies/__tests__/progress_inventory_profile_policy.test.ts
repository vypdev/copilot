import { partitionProgressDiff } from '../progress_diff_partition_policy';
import { initialProgressRecoveryUsage as initial, spendProgressRecovery as spend, PROGRESS_RECOVERY_TOTAL_LIMITS, MAX_PROGRESS_RECOVERY_FRAMES } from '../progress_recovery_capacity_policy';
import { IMMUTABLE_PROGRESS_PROFILE, progressUnitLimit } from '../progress_inventory_profile_policy';
const profile = 'immutable-tree-v1';

describe('versioned complete-inventory resource admission', () => {
    it('retains the framed-v1 file allowance', () => { expect(PROGRESS_RECOVERY_TOTAL_LIMITS.files).toBe(256); });
    it('retains the framed-v1 frame allowance', () => { expect(MAX_PROGRESS_RECOVERY_FRAMES).toBe(4); });
    it('retains the framed-v1 512-unit allowance', () => { expect(progressUnitLimit('framed-v1')).toBe(512); });
    it('bounds the new complete unit inventory independently', () => { expect(progressUnitLimit(profile)).toBe(4096); });
    it('allows exactly 1024 represented files over sixteen epochs', () => { let u=initial();for(let n=0;n<1024;n++)u=spend(u,'files',1,profile);expect(u.total.files).toBe(1024);expect(u.frames).toBe(16); });
    it('rejects file 1025 before consuming credit', () => { let u=initial();for(let n=0;n<16;n++)u=spend(u,'files',64,profile);expect(()=>spend(u,'files',1,profile)).toThrow();expect(u.total.files).toBe(1024); });
    it('retains the existing sixteen MiB global byte ceiling', () => { let u=initial();for(let n=0;n<4;n++)u=spend(u,'bytes',4194304,profile);expect(u.total.bytes).toBe(16777216);expect(()=>spend(u,'bytes',1,profile)).toThrow(); });
    it('allows exactly 2048 Git-object reads', () => { let u=initial();for(let n=0;n<2048;n++)u=spend(u,'requests',1,profile);expect(u.total.requests).toBe(2048);expect(()=>spend(u,'requests',1,profile)).toThrow(); });
    it('retains the global 200000-directory-entry ceiling', () => { let u=initial();for(let n=0;n<4;n++)u=spend(u,'treeEntries',50000,profile);expect(u.total.treeEntries).toBe(200000);expect(()=>spend(u,'treeEntries',1,profile)).toThrow(); });
    it('rejects a single oversized byte claim', () => { expect(()=>spend(initial(),'bytes',4194305,profile)).toThrow(); });
    it('rejects a single oversized file claim', () => { expect(()=>spend(initial(),'files',65,profile)).toThrow(); });
    it('rejects a single oversized request claim', () => { expect(()=>spend(initial(),'requests',257,profile)).toThrow(); });
    it('rejects a single oversized directory response before traversal', () => { expect(()=>spend(initial(),'treeEntries',50001,profile)).toThrow(); });
    it('rejects a negative resource claim', () => { expect(()=>spend(initial(),'files',-1,profile)).toThrow(); });
    it('rejects a fractional resource claim', () => { expect(()=>spend(initial(),'files',0.5,profile)).toThrow(); });
    it('rejects a nonfinite resource claim', () => { expect(()=>spend(initial(),'bytes',Infinity,profile)).toThrow(); });
    it('rejects an unknown resource name', () => { expect(()=>spend(initial(),'arbitrary' as never,1,profile)).toThrow(); });
    it('rejects an unknown profile version', () => { expect(()=>spend(initial(),'files',1,'immutable-tree-v2' as never)).toThrow(); });
    it('does not reset global credit when opening an epoch', () => { const full=spend(initial(),'files',64,profile);const next=spend(full,'files',1,profile);expect(next.total.files).toBe(65);expect(next.current.files).toBe(1);expect(full.total.files).toBe(64); });
    it('retains unrelated counters within an epoch', () => { const u=spend(spend(initial(),'requests',1,profile),'files',1,profile);expect(u.current.requests).toBe(1);expect(u.total.requests).toBe(1); });
    it('freezes usage counters against post-admission mutation', () => { const u=spend(initial(),'files',1,profile);expect(Object.isFrozen(u)).toBe(true);expect(Object.isFrozen(u.current)).toBe(true);expect(Object.isFrozen(u.total)).toBe(true); });
    it('accepts a zero claim without opening an epoch', () => { const u=initial();expect(spend(u,'files',0,profile)).toBe(u); });
    it('does not increase legacy recovery by selecting no new profile', () => { let u=initial();for(let n=0;n<4;n++)u=spend(u,'files',64);expect(()=>spend(u,'files',1)).toThrow(); });
    it('keeps every closed profile value immutable', () => { expect(Object.isFrozen(IMMUTABLE_PROGRESS_PROFILE)).toBe(true);expect(Object.isFrozen(IMMUTABLE_PROGRESS_PROFILE.total)).toBe(true); });
    it('rejects an empty new-profile inventory rather than returning a legacy single request',()=>{expect(()=>partitionProgressDiff('a','b',[],'immutable-tree-v1')).toThrow();});
    it('requires unit identities on every new-profile change',()=>{expect(()=>partitionProgressDiff('a','b',[{path:'a',status:'added',statistics:'immutable-content-only'}],'immutable-tree-v1')).toThrow();});
    it('rejects source unit 4097 before source packing or model requests',()=>{
        const units=Array.from({length:4097},(_,n)=>({path:'source',status:'added',statistics:'immutable-content-only' as const,unitId:'unit-'+n}));
        expect(()=>partitionProgressDiff('a','b',units,'immutable-tree-v1')).toThrow(expect.objectContaining({recovery:{id:'progress-inventory-incomplete',variables:{profile:'immutable-tree-v1',reason:'units',observedCount:4097,supportedLimit:4096,countKind:'exact',paths:JSON.stringify(['source'])}}}));
    });
});
