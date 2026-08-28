import { INPUT_KEYS } from '../utils/constants';
import { buildAgentTasks } from './agent_configuration_builder';
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_PROVIDER, DEFAULT_MODEL_PROVIDER } from '../domain/agent';

export type AgentInputReader = (key: string) => string | undefined;

export function buildAgentTasksFromInputs(read: AgentInputReader) {
    const provider = read(INPUT_KEYS.AGENT_PROVIDER)?.trim() || DEFAULT_AGENT_PROVIDER;
    const modelProvider = read(INPUT_KEYS.AGENT_MODEL_PROVIDER)?.trim() || DEFAULT_MODEL_PROVIDER;
    const model = read(INPUT_KEYS.AGENT_MODEL)?.trim() || DEFAULT_AGENT_MODEL;
    const effort = read(INPUT_KEYS.AGENT_EFFORT) ?? '';
    const command = read(INPUT_KEYS.AGENT_COMMAND) ?? '';
    return buildAgentTasks({
        provider,
        modelProvider,
        model,
        effort,
        command,
        findings: {
            provider: read(INPUT_KEYS.FINDINGS_PROVIDER),
            modelProvider: read(INPUT_KEYS.FINDINGS_MODEL_PROVIDER),
            model: read(INPUT_KEYS.FINDINGS_MODEL),
            effort: read(INPUT_KEYS.FINDINGS_EFFORT),
            command: read(INPUT_KEYS.FINDINGS_COMMAND),
        },
        fixer: {
            provider: read(INPUT_KEYS.FIXER_PROVIDER),
            modelProvider: read(INPUT_KEYS.FIXER_MODEL_PROVIDER),
            model: read(INPUT_KEYS.FIXER_MODEL),
            effort: read(INPUT_KEYS.FIXER_EFFORT),
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
