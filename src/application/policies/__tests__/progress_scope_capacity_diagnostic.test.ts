import { isProgressScopeCapacityFacts, type ProgressScopeCapacityFacts } from '../../../domain/progress_response_diagnostic';
import { progressScopeCapacityRejected } from '../progress_response_rejection_policy';
import { ApplicationError } from '../../errors/application_error';

const facts: ProgressScopeCapacityFacts = { clauseKind: 'required-or-uncertain', observed: 33, limit: 32, sourceLineId: 'L41' };
it.each([
    facts, { ...facts, clauseKind: 'excluded' as const, observed: 1024 },
])('accepts only bounded exact scope capacity facts %#', value => {
    expect(isProgressScopeCapacityFacts(value)).toBe(true);
    const error = progressScopeCapacityRejected(value);
    expect(error).toMatchObject({ code: 'agent.failed', recovery: { id: 'progress-scope-clause-limit', variables: value } });
    expect(error.message).toContain('scope-clause-limit'); expect(error.message).toContain(String(value.observed));
    expect(Object.isFrozen(error.recovery!.variables)).toBe(true);
});
it.each([
    null, [], 42, {}, { ...facts, extra: 'PRIVATE_PROVIDER_PROSE' }, { ...facts, clauseKind: 'PRIVATE_PROVIDER_PROSE' },
    { ...facts, observed: NaN }, { ...facts, observed: 33.5 }, { ...facts, observed: 32 }, { ...facts, observed: 1025 },
    { ...facts, observed: '33' }, { ...facts, limit: 33 }, { ...facts, sourceLineId: 'PRIVATE_PROVIDER_PROSE' },
    { ...facts, sourceLineId: 'L0' }, { ...facts, sourceLineId: 'L524290' },
])('rejects malformed or forged capacity facts without publishing source values %#', value => {
    expect(isProgressScopeCapacityFacts(value)).toBe(false);
    expect(() => progressScopeCapacityRejected(value as never)).toThrow(TypeError);
    expect(() => new ApplicationError('agent.failed', 'scope', { recovery: { id: 'progress-scope-clause-limit', variables: value as never } })).toThrow(TypeError);
});
