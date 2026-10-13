import { planIssueCompletion, ISSUE_COMPLETION_LABEL_LIMIT } from '../issue_completion';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../copilot_lifecycle';
import type { IssueCompletionLabelConfiguration, NativeIssueCompletionFacts } from '../issue_completion';
const configuration: IssueCompletionLabelConfiguration = { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
    protectedLabels: ['feature', 'size: XXL', 'priority: high', 'branched', 'SDD', 'contract-change'] };
const facts = (overrides: Partial<NativeIssueCompletionFacts> = {}): NativeIssueCompletionFacts => ({
    number: 17, state: 'closed', reason: 'completed', labels: [], ...overrides,
});
describe('verified issue completion plan', () => {
    it('removes only managed activity and stale progress while preserving kind and artifacts', () => {
        const active = ['in-progress', ...Object.values(DEFAULT_COPILOT_LIFECYCLE_LABELS), '55%'];
        const plan = planIssueCompletion(facts({ labels: [...active, ...configuration.protectedLabels, 'external'] }), configuration);
        expect(plan).toEqual({ kind: 'closed', reason: 'completed', remove: active, add: ['100%'] });
        expect(Object.isFrozen(plan)).toBe(true);
        if (plan.kind === 'closed') expect(Object.isFrozen(plan.remove)).toBe(true);
    });
    it('returns an empty idempotent delta for already completed metadata', () => {
        expect(planIssueCompletion(facts({ labels: ['100%', 'branched', 'SDD'] }), configuration)).toMatchObject({ remove: [], add: [] });
    });
    it('does not certify completion for not-planned closure', () => {
        expect(planIssueCompletion(facts({ reason: 'not_planned', labels: ['state:working', '100%'] }), configuration))
            .toEqual({ kind: 'closed', reason: 'not_planned', remove: ['state:working', '100%'], add: [] });
    });
    it('clears obsolete progress without adding completion for an unknown reason', () => {
        expect(planIssueCompletion(facts({ reason: 'unknown', labels: ['55%'] }), configuration)).toMatchObject({ remove: ['55%'], add: [] });
    });
    it('never repairs completion metadata on an open or reopened issue', () => {
        expect(planIssueCompletion(facts({ state: 'open', reason: 'reopened', labels: ['100%'] }), configuration)).toEqual({ kind: 'open' });
    });
    it.each([0, Number.MAX_SAFE_INTEGER + 1])('rejects issue identity %s before planning writes', number => {
        expect(planIssueCompletion(facts({ number }), configuration)).toEqual({ kind: 'invalid', code: 'invalid-identity' });
    });
    it('rejects malformed native state', () => {
        expect(planIssueCompletion(facts({ state: 'CLOSED' as never }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects an unavailable inventory rather than assuming no labels', () => {
        expect(planIssueCompletion(facts({ labels: undefined as never }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects a malformed inventory entry', () => {
        expect(planIssueCompletion(facts({ labels: ['branched', 1] as never }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects an inventory beyond the fixed bound', () => {
        expect(planIssueCompletion(facts({ labels: Array.from({ length: ISSUE_COMPLETION_LABEL_LIMIT + 1 }, (_, i) => `label-${i}`) }), configuration))
            .toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects incomplete configured managed label names', () => {
        expect(planIssueCompletion(facts(), { ...configuration, lifecycle: { ...configuration.lifecycle, working: '' } }))
            .toMatchObject({ kind: 'invalid', code: 'invalid-configuration' });
    });
    it('rejects a case-insensitive managed/protected role collision', () => {
        expect(planIssueCompletion(facts({ labels: ['Feature'] }), { ...configuration, lifecycle: { ...configuration.lifecycle, working: 'FEATURE' } }))
            .toMatchObject({ kind: 'invalid', code: 'invalid-configuration' });
    });
    it('distinguishes canonical progress endpoints from unrelated lookalikes', () => {
        expect(planIssueCompletion(facts({ labels: ['0%', '100%', '01%', '101%', 'State:Working'] }), configuration))
            .toEqual({ kind: 'closed', reason: 'completed', remove: ['0%', 'State:Working'], add: [] });
    });
});

describe('completion boundary validation', () => {
    it('rejects absent native facts before looking at labels', () => {
        expect(planIssueCompletion(undefined as never, configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-identity' });
    });
    it('rejects an unknown native reason rather than adding completion', () => {
        expect(planIssueCompletion(facts({ reason: 'unexpected' as never }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects overlong and control-bearing labels', () => {
        for (const label of ['a'.repeat(101), 'bad\u007f', 'bad\u001f']) {
            expect(planIssueCompletion(facts({ labels: [label] }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
        }
    });
    it('rejects case-insensitive duplicate native labels', () => {
        expect(planIssueCompletion(facts({ labels: ['SDD', 'sdd'] }), configuration)).toMatchObject({ kind: 'invalid', code: 'invalid-metadata' });
    });
    it('rejects absent lifecycle configuration', () => {
        expect(planIssueCompletion(facts(), undefined as never)).toMatchObject({ kind: 'invalid', code: 'invalid-configuration' });
    });
    it('rejects an unavailable protected-label inventory', () => {
        expect(planIssueCompletion(facts(), { ...configuration, protectedLabels: undefined as never })).toMatchObject({ kind: 'invalid', code: 'invalid-configuration' });
    });
    it('rejects a protected label colliding with canonical progress', () => {
        expect(planIssueCompletion(facts(), { ...configuration, protectedLabels: ['100%'] })).toMatchObject({ kind: 'invalid', code: 'invalid-configuration' });
    });
});


it.each(['100%', '0%'])('rejects configured lifecycle progress collision %s before any completion delta', working => {
    expect(planIssueCompletion(facts({ labels: [working] }), { ...configuration, lifecycle: { ...configuration.lifecycle, working } }))
        .toEqual({ kind: 'invalid', code: 'invalid-configuration' });
});


it.each([['open', 'completed'], ['open', 'not_planned'], ['open', 'duplicate'], ['closed', 'reopened']] as const)('rejects contradictory native %s/%s facts before authorizing writes', (state, reason) => {
    expect(planIssueCompletion(facts({ state, reason }), configuration)).toEqual({ kind: 'invalid', code: 'invalid-metadata' });
});

it('clears obsolete progress for native duplicate closure without certifying completion', () => {
    expect(planIssueCompletion(facts({ reason: 'duplicate', labels: ['100%', '55%', 'state:working', 'SDD'] }), configuration))
        .toEqual({ kind: 'closed', reason: 'duplicate', remove: ['100%', '55%', 'state:working'], add: [] });
});
