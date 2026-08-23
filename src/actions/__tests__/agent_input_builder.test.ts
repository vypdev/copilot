import { INPUT_KEYS } from '../../utils/constants';
import { buildAgentTasksFromValues } from '../agent_input_builder';

describe('agent input builder', () => {
    it('applies defaults and task-specific overrides consistently', () => {
        const tasks = buildAgentTasksFromValues({
            [INPUT_KEYS.AGENT_PROVIDER]: 'opencode',
            [INPUT_KEYS.AGENT_TRANSPORT]: 'server',
            [INPUT_KEYS.AGENT_MODEL]: 'base-model',
            [INPUT_KEYS.FINDINGS_PROVIDER]: 'codex',
            [INPUT_KEYS.FINDINGS_TRANSPORT]: 'cli',
            [INPUT_KEYS.FINDINGS_MODEL]: 'codex-model',
        });
        expect(tasks.findings).toMatchObject({ provider: 'codex', transport: 'cli', model: 'codex-model', command: 'codex exec --ephemeral --skip-git-repo-check -' });
        expect(tasks.fixer).toMatchObject({ provider: 'opencode', transport: 'server', model: 'base-model' });
    });
});
