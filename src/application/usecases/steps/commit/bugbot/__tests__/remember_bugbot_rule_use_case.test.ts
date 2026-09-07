import type { Execution } from '../../../../../../data/model/execution';
import type { BugbotLearnedRuleCommandPort } from '../../../../../ports/bugbot_rule_ports';
import { RememberBugbotRuleUseCase } from '../remember_bugbot_rule_use_case';

describe('RememberBugbotRuleUseCase', () => {
    const execution = {} as Execution;

    it.each([
        ['created', true, 'added'],
        ['existing', false, 'already exists'],
    ] as const)('reports a %s learned rule', async (state, executed, message) => {
        const rules: BugbotLearnedRuleCommandPort = { rememberRule: jest.fn().mockResolvedValue(state) };

        const [result] = await new RememberBugbotRuleUseCase(rules).invoke({ execution, rule: 'Validate ownership' });

        expect(result).toEqual(expect.objectContaining({ success: true, executed }));
        expect(result.steps.join(' ')).toContain(message);
        expect(result.payload).toEqual({ learnedRule: state });
    });

    it.each([
        [new Error('storage unavailable'), 'storage unavailable'],
        ['failure', 'Unable to remember the Bugbot rule.'],
    ])('returns a safe failure result when persistence rejects', async (error, message) => {
        const rules: BugbotLearnedRuleCommandPort = { rememberRule: jest.fn().mockRejectedValue(error) };

        const [result] = await new RememberBugbotRuleUseCase(rules).invoke({ execution, rule: 'Validate ownership' });

        expect(result).toEqual(expect.objectContaining({ success: false, executed: false }));
        expect(result.errors[0]?.message).toBe(message);
    });
});
