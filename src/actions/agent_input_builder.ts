import { INPUT_KEYS } from '../utils/constants';
import { buildAgentTasks } from './agent_configuration_builder';

const DEFAULT_AGENT_PROVIDER = 'codex';
const DEFAULT_MODEL_PROVIDER = 'openai';
const DEFAULT_AGENT_MODEL = 'gpt-5.6-luna';

export type AgentInputReader = (key: string) => string | undefined;

export function buildAgentTasksFromInputs(read: AgentInputReader) {
    const provider = read(INPUT_KEYS.AGENT_PROVIDER)?.trim() || DEFAULT_AGENT_PROVIDER;
    const modelProvider = read(INPUT_KEYS.AGENT_MODEL_PROVIDER)?.trim() || DEFAULT_MODEL_PROVIDER;
    const model = read(INPUT_KEYS.AGENT_MODEL)?.trim() || DEFAULT_AGENT_MODEL;
    const command = read(INPUT_KEYS.AGENT_COMMAND) ?? '';
    return buildAgentTasks({
        provider,
        modelProvider,
        model,
        command,
        findings: {
            provider: read(INPUT_KEYS.FINDINGS_PROVIDER),
            model: read(INPUT_KEYS.FINDINGS_MODEL),
            command: read(INPUT_KEYS.FINDINGS_COMMAND),
        },
        fixer: {
            provider: read(INPUT_KEYS.FIXER_PROVIDER),
            model: read(INPUT_KEYS.FIXER_MODEL),
            command: read(INPUT_KEYS.FIXER_COMMAND),
        },
    });
}

export function buildAgentTasksFromValues(values: Record<string, unknown>) {
    return buildAgentTasksFromInputs((key) => {
        const value = values[key];
        return value == null ? undefined : String(value);
    });
}
