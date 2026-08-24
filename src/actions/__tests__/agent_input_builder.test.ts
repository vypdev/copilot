import { INPUT_KEYS } from '../../utils/constants';
import { buildAgentTasksFromValues } from '../agent_input_builder';

describe('agent input builder', () => {
    it('applies defaults and task-specific overrides consistently', () => {
        const tasks = buildAgentTasksFromValues({
            [INPUT_KEYS.AGENT_PROVIDER]: 'opencode',

            [INPUT_KEYS.AGENT_MODEL]: 'base-model',
            [INPUT_KEYS.FINDINGS_PROVIDER]: 'codex',

            [INPUT_KEYS.FINDINGS_MODEL]: 'codex-model',
        });
        expect(tasks.findings).toMatchObject({ provider: 'codex', modelProvider: 'openai', model: 'codex-model', command: 'codex exec --ephemeral --skip-git-repo-check -' });
        expect(tasks.fixer).toMatchObject({ provider: 'opencode', modelProvider: 'openai', model: 'base-model', command: 'opencode run --model openai/base-model' });
    });
});
