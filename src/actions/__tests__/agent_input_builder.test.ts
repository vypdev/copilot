import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { buildAgentTasksFromValues } from '../agent_input_builder';

describe('agent input builder', () => {
    it('applies defaults and task-specific overrides consistently', () => {
        const tasks = buildAgentTasksFromValues({
            [INPUT_KEYS.AGENT_PROVIDER]: 'opencode',
            [INPUT_KEYS.AGENT_EFFORT]: 'medium',
            [INPUT_KEYS.AGENT_MODEL]: 'base-model',
            [INPUT_KEYS.FINDINGS_PROVIDER]: 'codex',
            [INPUT_KEYS.FINDINGS_MODEL_PROVIDER]: 'openai',
            [INPUT_KEYS.FINDINGS_MODEL]: 'codex-model',
            [INPUT_KEYS.FINDINGS_EFFORT]: 'high',
            [INPUT_KEYS.FIXER_EFFORT]: 'low',
        });
        expect(tasks.findings).toMatchObject({ provider: 'codex', modelProvider: 'openai', model: 'codex-model', effort: 'high', command: "codex exec --ephemeral --skip-git-repo-check --model codex-model --config 'model_provider=\"openai\"' --config 'model_reasoning_effort=\"high\"' -" });
        expect(tasks.fixer).toMatchObject({ provider: 'opencode', modelProvider: 'openai', model: 'base-model', effort: 'low', command: 'opencode run --model openai/base-model --variant low' });
    });

    it('supports independent planner and reviewer roles while preserving the base fallback', () => {
        const tasks = buildAgentTasksFromValues({
            [INPUT_KEYS.AGENT_PROVIDER]: 'codex',
            [INPUT_KEYS.AGENT_MODEL]: 'base-model',
            [INPUT_KEYS.PLANNER_PROVIDER]: 'opencode',
            [INPUT_KEYS.PLANNER_MODEL_PROVIDER]: 'anthropic',
            [INPUT_KEYS.PLANNER_MODEL]: 'claude-model',
            [INPUT_KEYS.PLANNER_EFFORT]: 'high',
            [INPUT_KEYS.REVIEWER_PROVIDER]: 'cursor',
            [INPUT_KEYS.REVIEWER_MODEL_PROVIDER]: 'openai',
            [INPUT_KEYS.REVIEWER_MODEL]: 'review-model',
        });

        expect(tasks.planner).toMatchObject({ provider: 'opencode', modelProvider: 'anthropic', model: 'claude-model', effort: 'high' });
        expect(tasks.reviewer).toMatchObject({ provider: 'cursor', modelProvider: 'openai', model: 'review-model' });
        expect(tasks.tester).toBeUndefined();
        expect(tasks.findings.provider).toBe('codex');
    });
});
