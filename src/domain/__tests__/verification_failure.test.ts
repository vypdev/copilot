import { isBranchSyncVerificationFailure } from '../verification_failure';
import { ApplicationError } from '../../application/errors/application_error';
const facts = {stage:'dependencies',reason:'unsupported-graph',command:'configured-command',commandIndex:1,childSha:'a'.repeat(40),restoration:'restored'} as const;
it.each([
    {stage:'private'}, {reason:'TOKEN=secret'}, {command:'curl https://private/token'},
    {commandIndex:0}, {commandIndex:21}, {commandIndex:1.1}, {commandIndex:'1'},
    {childSha:'malformed'}, {childSha:1}, {restoration:'assumed'},
])('rejects unsafe or out-of-contract verification facts: %j', change => {
    expect(isBranchSyncVerificationFailure({...facts,...change})).toBe(false);
    expect(() => new ApplicationError('workflow.failed','safe',{recovery:{id:'branch-sync-verification-failed',variables:{...facts,...change}} as never})).toThrow('diagnostic is invalid');
});
it.each(['a'.repeat(40), 'b'.repeat(64), 'unavailable'])('admits bounded SHA representation %s', childSha => {
    const variables = {...facts,childSha,restoration:'unverified'} as const;
    expect(isBranchSyncVerificationFailure(variables)).toBe(true);
    expect(new ApplicationError('workflow.failed','safe',{recovery:{id:'branch-sync-verification-failed',variables}}).toJSON().recovery).toEqual({id:'branch-sync-verification-failed',variables});
});
