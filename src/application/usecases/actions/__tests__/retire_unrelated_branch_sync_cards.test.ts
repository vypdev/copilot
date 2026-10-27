import { retireUnrelatedBranchSyncCards } from '../retire_unrelated_branch_sync_cards';
import { unrelatedBranchSyncCards } from '../../../policies/branch_sync_relationship_retirement_policy';
import { buildAlignedBranchSyncComment, buildStaleBranchSyncComment, buildUnrelatedBranchSyncComment, branchSyncPublicationIdentity, buildRetiredBranchSyncComment } from '../../../policies/branch_sync_notification_policy';
import { resolveStaticBranchSyncCatalog } from '../../../policies/branch_sync_message_catalog';
import { buildPublicationMarker, parsePublicationMarker } from '../../../policies/publication_identity_policy';
import { replyRequestBodyDigest } from '../../../../domain/reply_request_digest';
import type { IssueCommentPublicationTarget } from '../../../ports/issue_lifecycle_ports';
import type { ReplyRequestSnapshot } from '../../../ports/reply_request_read_ports';
const current = {issueNumber:89,parentBranch:'develop',workingBranch:'bugfix/89-authorization'};
const old = {...current,workingBranch:'bugfix/74-history'};
const messages = resolveStaticBranchSyncCatalog('en-US');
const stale = buildStaleBranchSyncComment({owner:'org',repository:'repo',dependency:old,comparison:{aheadBy:6,behindBy:7},messages});
const card = (body: string | null = stale, id=8, login='vypbot'): IssueCommentPublicationTarget => ({id,body,user:{login}});
function setup(comments=[card()]) {
  const stored = comments.map(value=>({...value}));
  const freshness = {matches:jest.fn(async (witness:ReplyRequestSnapshot)=>{
    const found=stored.find(value=>value.id===witness.commentId);
    return witness.target.kind==='issue' && witness.target.number===89 && found?.user?.login?.toLowerCase()===witness.author.toLowerCase()
      && replyRequestBodyDigest(found?.body??'')===witness.bodyDigest;
  })};
  const updates={updateComment:jest.fn(async (issue:number,id:number,body:string)=>{ expect(issue).toBe(89); stored.find(value=>value.id===id)!.body=body; })};
  const input={comments:stored.map(value=>({...value})),current,botLogin:'vypbot',messages,freshness,updates,
    assertCurrent:jest.fn(async()=>{}),onUpdated:jest.fn()};
  return {stored,input,run:()=>retireUnrelatedBranchSyncCards(input)};
}
describe('historical unrelated branch cards (#723)',()=>{
  it('retires the issue89/dependency74 instruction in place without claiming alignment',async()=>{
    const f=setup(); await f.run();
    expect(f.input.updates.updateComment).toHaveBeenCalledTimes(1);
    expect(f.input.onUpdated).toHaveBeenCalledTimes(1);
    expect(f.stored[0].body).toContain(current.workingBranch);
    expect(f.stored[0].body).not.toContain('/copilot sync-branch');
    expect(f.stored[0].body).toContain('does not certify synchronization');
    expect(parsePublicationMarker(f.stored[0].body)?.identity).toEqual(branchSyncPublicationIdentity(old));
  });
  it('retires an unrelated aligned/resolved card as historical rather than resolving current drift',async()=>{
    const f=setup([card(buildAlignedBranchSyncComment(old,messages))]); await f.run();
    expect(f.stored[0].body).not.toContain('recommendation has been resolved');
    expect(parsePublicationMarker(f.stored[0].body)?.sourceVersion).toMatch(/^relationship-retired:/);
  });
  it('preserves the authoritative current stale card byte for byte',async()=>{
    const body=buildStaleBranchSyncComment({owner:'org',repository:'repo',dependency:current,comparison:{aheadBy:1,behindBy:2},messages});
    const f=setup([card(body,9),card()]); await f.run();
    expect(f.stored[0].body).toBe(body); expect(f.input.updates.updateComment).toHaveBeenCalledWith(89,8,expect.any(String));
  });
  it('is silent on an equivalent repair replay',async()=>{
    const f=setup([card(buildUnrelatedBranchSyncComment(branchSyncPublicationIdentity(old),current,messages))]); await f.run();
    expect(f.input.updates.updateComment).not.toHaveBeenCalled(); expect(f.input.assertCurrent).toHaveBeenCalled();
  });
  it('updates a historical retirement when the current admitted pair changes',async()=>{
    const f=setup([card(buildUnrelatedBranchSyncComment(branchSyncPublicationIdentity(old),{...current,workingBranch:'previous-current'},messages))]); await f.run();
    expect(f.stored[0].body).toContain(current.workingBranch); expect(f.input.onUpdated).toHaveBeenCalledTimes(1);
  });
  it('can neutralize a closed historical card after the issue is reopened with a different pair',async()=>{
    const f=setup([card(buildRetiredBranchSyncComment(branchSyncPublicationIdentity(old),messages))]); await f.run();
    expect(f.stored[0].body).toContain('Previous branch advisory retired');
  });
  it('does not edit a human copy of a valid marker',async()=>{
    const f=setup([card(stale,8,'maintainer')]); await f.run(); expect(f.input.updates.updateComment).not.toHaveBeenCalled();
  });
  it('requires a trusted bot identity and leaves ordinary/null comments alone',async()=>{
    const f=setup([card(null),card('ordinary comment',9)]); await f.run();
    expect(f.input.freshness.matches).not.toHaveBeenCalled();
    expect(unrelatedBranchSyncCards([card()],current)).toEqual([]);
  });
  it('accepts canonical case-insensitive bot identity',()=>{
    expect(unrelatedBranchSyncCards([card(stale,8,'VypBot')],current,'vypbot')).toHaveLength(1);
  });
  it('rejects markers for another issue, PR target, topic, key, or unsupported source',()=>{
    const identity=branchSyncPublicationIdentity(old);
    const markers=[
      {...identity,target:{kind:'issue' as const,number:90}}, {...identity,target:{kind:'pull-request' as const,number:89}},
      {...identity,topic:'plan' as const}, {...identity,key:'dependency:invalid'},
    ];
    const candidates=markers.map((value,index)=>card(buildPublicationMarker({identity:value,sourceVersion:'comparison:'+'a'.repeat(16),digest:'b'.repeat(16)}),index+1));
    candidates.push(card(buildPublicationMarker({identity,sourceVersion:'unknown:state',digest:'b'.repeat(16)}),20));
    expect(unrelatedBranchSyncCards(candidates,current,'vypbot')).toEqual([]);
  });
  it('rejects missing authors and invalid provider comment IDs',()=>{
    expect(unrelatedBranchSyncCards([{id:8,body:stale},card(stale,0),card(stale,-1),card(stale,1.5)],current,'vypbot')).toEqual([]);
  });
  it('fails before writes when more than twenty historical cards would be edited',async()=>{
    const f=setup(Array.from({length:21},(_,index)=>card(stale,index+1)));
    await expect(f.run()).rejects.toMatchObject({code:'workflow.stale'}); expect(f.input.updates.updateComment).not.toHaveBeenCalled();
  });
  it('processes exactly twenty cards within the fixed safety bound',async()=>{
    const f=setup(Array.from({length:20},(_,index)=>card(stale,index+1))); await f.run();
    expect(f.input.updates.updateComment).toHaveBeenCalledTimes(20);
  });
  it('withholds retirement without a freshness capability',async()=>{
    const f=setup(); await expect(retireUnrelatedBranchSyncCards({...f.input,freshness:undefined})).rejects.toMatchObject({code:'workflow.stale'});
    expect(f.input.updates.updateComment).not.toHaveBeenCalled();
  });
  it('preserves a card edited after inventory instead of overwriting it',async()=>{
    const f=setup(); f.stored[0].body='human changed this card';
    await expect(f.run()).rejects.toMatchObject({code:'workflow.stale'}); expect(f.stored[0].body).toBe('human changed this card');
  });
  it('withholds writes if issue state or relationship changed at the pre-write fence',async()=>{
    const f=setup(); f.input.assertCurrent.mockRejectedValueOnce(new Error('changed'));
    await expect(f.run()).rejects.toThrow('changed'); expect(f.input.updates.updateComment).not.toHaveBeenCalled();
  });
  it('adopts an equivalent concurrent repair only after verifying its final body',async()=>{
    const f=setup(); f.stored[0].body=buildUnrelatedBranchSyncComment(branchSyncPublicationIdentity(old),current,messages);
    await f.run(); expect(f.input.updates.updateComment).not.toHaveBeenCalled(); expect(f.input.assertCurrent).toHaveBeenCalled();
  });
  it('does not report success when a provider acknowledges but loses the update',async()=>{
    const f=setup(); f.input.updates.updateComment.mockImplementationOnce(async()=>{});
    await expect(f.run()).rejects.toMatchObject({code:'workflow.stale'}); expect(f.input.onUpdated).toHaveBeenCalledTimes(1);
  });
  it('retains a failed write cause if the final card cannot be verified',async()=>{
    const f=setup(); f.input.updates.updateComment.mockRejectedValueOnce(new Error('provider failed'));
    await expect(f.run()).rejects.toThrow('provider failed'); expect(f.input.onUpdated).not.toHaveBeenCalled();
  });
  it('verifies and adopts a committed write even if its transport response was lost',async()=>{
    const f=setup(); f.input.updates.updateComment.mockImplementationOnce(async(_issue,id,body)=>{f.stored.find(value=>value.id===id)!.body=body;throw new Error('lost reply');});
    await f.run(); expect(f.stored[0].body).toContain('Previous branch advisory retired');
  });
  it('retains the acknowledged effect count when a later card fails',async()=>{
    const f=setup([card(stale,8),card(stale,9)]); f.input.updates.updateComment.mockImplementationOnce(async(_issue,id,body)=>{f.stored.find(value=>value.id===id)!.body=body;});
    f.input.updates.updateComment.mockRejectedValueOnce(new Error('second failed'));
    await expect(f.run()).rejects.toThrow('second failed'); expect(f.input.onUpdated).toHaveBeenCalledTimes(1);
  });
  it('does not undo an update if the post-write relationship check fails',async()=>{
    const f=setup(); f.input.assertCurrent.mockResolvedValueOnce().mockRejectedValueOnce(new Error('relationship moved'));
    await expect(f.run()).rejects.toThrow('relationship moved'); expect(f.input.updates.updateComment).toHaveBeenCalledTimes(1);
    expect(f.stored[0].body).toContain('Previous branch advisory retired');
  });
  it('renders Spanish retirement with exact current issue and branch identities',async()=>{
    const f=setup(); f.input.messages=resolveStaticBranchSyncCatalog('es-ES'); await f.run();
    expect(f.stored[0].body).toContain('Aviso anterior de rama retirado'); expect(f.stored[0].body).toContain('issue #89');
    expect(f.stored[0].body).toContain('`develop`'); expect(f.stored[0].body).not.toContain('/copilot');
  });
});
