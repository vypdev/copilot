import type { AgentTask, AgentTaskConfiguration } from '../data/model/agent';
import { AgentCliProvisioner } from '../data/repository/agent_cli_provisioner';
import { runAgentAuthenticationPreflight } from '../data/repository/agent_authentication_preflight';
import { logInfo, logDebugInfo } from '../utils/logger';

/** Validates and, when requested by the runtime, provisions the selected agent CLIs. */
export function prepareGithubAgentRuntime(
    agentTasks: AgentTaskConfiguration,
    activeTasks?: readonly AgentTask[],
): void {
    const configurations = selectedAgentTasks(agentTasks, activeTasks);
    for (const [task, configuration] of configurations) {
        const preflight = runAgentAuthenticationPreflight(configuration);
        if (preflight.check.status === 'missing' && preflight.shouldFail) {
            throw new Error(`${task} agent authentication failed: ${preflight.check.message}`);
        }
        if (preflight.check.status === 'missing' && preflight.mode === 'warn') {
            logInfo(`Warning: ${task} agent authentication could not be preflighted: ${preflight.check.message}`);
        }
    }

    if (process.env.GITHUB_ACTIONS === 'true') {
        const provisioner = new AgentCliProvisioner();
        for (const configuration of uniqueAgentConfigurations(configurations)) {
            provisioner.provision(configuration);
        }
    }

    logDebugInfo(configurations.length === 0
        ? 'No agent CLI is required for this event.'
        : `Active agent roles: ${configurations.map(([task, configuration]) =>
            `${task}=${configuration.provider}/${configuration.modelProvider ?? 'default'}/${configuration.model}`).join(', ')}.`);
}

function configuredAgentTasks(
    agentTasks: AgentTaskConfiguration,
): Array<[string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>]> {
    return (Object.entries(agentTasks) as Array<[string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>]>)
        .filter(([, configuration]) => configuration != null);
}

function selectedAgentTasks(
    agentTasks: AgentTaskConfiguration,
    activeTasks: readonly AgentTask[] | undefined,
) {
    if (!activeTasks) return configuredAgentTasks(agentTasks);
    return activeTasks.map((task) => [task, agentTasks[task] ?? agentTasks.findings] as const);
}

function uniqueAgentConfigurations(
    configurations: ReadonlyArray<readonly [string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>]>,
) {
    const unique = new Map<string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>>();
    for (const [, configuration] of configurations) {
        unique.set(JSON.stringify(configuration), configuration);
    }
    return [...unique.values()];
}
