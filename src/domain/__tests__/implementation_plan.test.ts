import {
    IMPLEMENTATION_PLAN_ACCEPTANCE_MAX_LENGTH,
    IMPLEMENTATION_PLAN_DETAIL_MAX_LENGTH,
    IMPLEMENTATION_PLAN_MAX_STEPS,
    IMPLEMENTATION_PLAN_TITLE_MAX_LENGTH,
    implementationPlanFingerprintInput,
    parseImplementationPlan,
} from '../implementation_plan';

const step = (title = 'Implement the policy', details: unknown = []) => ({ title, details });
const plan = (overrides: Record<string, unknown> = {}) => ({
    steps: [step('Model the contract'), step('Render the card'), step('Test the behavior')],
    acceptance: 'All plan scenarios pass without duplicate comments.',
    ...overrides,
});

describe('implementation plan', () => {
    it('normalizes and freezes a bounded three-to-eight-step plan', () => {
        const parsed = parseImplementationPlan(plan({
            steps: [
                step('  Model the contract  ', ['  Add immutable types.  ']),
                step('Render the card', ['Use ordered steps.', 'Show acceptance.']),
                step('Test the behavior'),
            ],
            acceptance: '  All plan scenarios pass.  ',
        }));

        expect(parsed).toEqual({
            steps: [
                { title: 'Model the contract', details: ['Add immutable types.'] },
                { title: 'Render the card', details: ['Use ordered steps.', 'Show acceptance.'] },
                { title: 'Test the behavior', details: [] },
            ],
            acceptance: 'All plan scenarios pass.',
        });
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed?.steps)).toBe(true);
        expect(parsed?.steps.every(item => Object.isFrozen(item) && Object.isFrozen(item.details))).toBe(true);
        expect(implementationPlanFingerprintInput(parsed!)).toBe(JSON.stringify(parsed));
    });

    it.each([
        ['null plan', null],
        ['array plan', []],
        ['missing steps', { acceptance: 'Done.' }],
        ['additional plan field', plan({ metadata: 'not allowed' })],
        ['non-array steps', plan({ steps: 'three' })],
        ['too few steps', plan({ steps: [step(), step()] })],
        ['too many steps', plan({ steps: Array.from({ length: IMPLEMENTATION_PLAN_MAX_STEPS + 1 }, (_, index) => step(String(index))) })],
        ['non-string acceptance', plan({ acceptance: 42 })],
        ['empty acceptance', plan({ acceptance: '  ' })],
        ['multiline acceptance', plan({ acceptance: 'Done\nwhen green.' })],
        ['long acceptance', plan({ acceptance: 'a'.repeat(IMPLEMENTATION_PLAN_ACCEPTANCE_MAX_LENGTH + 1) })],
        ['non-object step', plan({ steps: [step(), step(), 'invalid'] })],
        ['additional step field', plan({ steps: [step(), step(), { ...step(), metadata: 'not allowed' }] })],
        ['non-string title', plan({ steps: [step(), step(), step(42 as never)] })],
        ['empty title', plan({ steps: [step(), step(), step('  ')] })],
        ['multiline title', plan({ steps: [step(), step(), step('Bad\ntitle')] })],
        ['long title', plan({ steps: [step(), step(), step('a'.repeat(IMPLEMENTATION_PLAN_TITLE_MAX_LENGTH + 1))] })],
        ['missing details', plan({ steps: [step(), step(), { title: 'No details' }] })],
        ['non-array details', plan({ steps: [step(), step(), step('Bad details', 'invalid')] })],
        ['too many details', plan({ steps: [step(), step(), step('Too many', ['a', 'b', 'c'])] })],
        ['non-string detail', plan({ steps: [step(), step(), step('Bad detail', [42])] })],
        ['empty detail', plan({ steps: [step(), step(), step('Bad detail', ['  '])] })],
        ['multiline detail', plan({ steps: [step(), step(), step('Bad detail', ['a\nb'])] })],
        ['long detail', plan({ steps: [step(), step(), step('Bad detail', ['a'.repeat(IMPLEMENTATION_PLAN_DETAIL_MAX_LENGTH + 1)])] })],
    ])('rejects %s', (_label, candidate) => {
        expect(parseImplementationPlan(candidate)).toBeUndefined();
    });
});
