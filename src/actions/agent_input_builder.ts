import { INPUT_KEYS, OPENCODE_DEFAULT_MODEL } from '../utils/constants';
import { buildAgentTasks } from './agent_configuration_builder';

export type AgentInputReader = (key: string) => string | undefined;

export function buildAgentTasksFromInputs(read: AgentInputReader) {
    const opencodeModel = read(INPUT_KEYS.OPENCODE_MODEL)?.trim() || OPENCODE_DEFAULT_MODEL;
    const provider = read(INPUT_KEYS.AGENT_PROVIDER)?.trim() || 'opencode';
    const modelProvider = read(INPUT_KEYS.AGENT_MODEL_PROVIDER)?.trim() || 'opencode';
    const model = read(INPUT_KEYS.AGENT_MODEL)?.trim() || opencodeModel;
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
