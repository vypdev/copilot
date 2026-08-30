import type { AgentTaskConfiguration } from '../data/model/agent';
import { AgentCliProvisioner } from '../data/repository/agent_cli_provisioner';
import { runAgentAuthenticationPreflight } from '../data/repository/agent_authentication_preflight';
import { logInfo, logDebugInfo } from '../utils/logger';

/** Validates and, when requested by the runtime, provisions the selected agent CLIs. */
export function prepareGithubAgentRuntime(agentTasks: AgentTaskConfiguration): void {
    for (const [task, configuration] of configuredAgentTasks(agentTasks)) {
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
        for (const configuration of uniqueAgentConfigurations(agentTasks)) {
            provisioner.provision(configuration);
        }
    }

    logDebugInfo(
        `Using ${agentTasks.findings.provider} CLI for findings (${agentTasks.findings.modelProvider ?? 'default'}/${agentTasks.findings.model}) ` +
        `and ${agentTasks.fixer.provider} CLI for fixer (${agentTasks.fixer.modelProvider ?? 'default'}/${agentTasks.fixer.model}).`,
    );
}

function configuredAgentTasks(
    agentTasks: AgentTaskConfiguration,
): Array<[string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>]> {
    return (Object.entries(agentTasks) as Array<[string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>]>)
        .filter(([, configuration]) => configuration != null);
}

function uniqueAgentConfigurations(agentTasks: AgentTaskConfiguration) {
    const unique = new Map<string, NonNullable<AgentTaskConfiguration[keyof AgentTaskConfiguration]>>();
    for (const [, configuration] of configuredAgentTasks(agentTasks)) {
        unique.set(JSON.stringify(configuration), configuration);
    }
    return [...unique.values()];
}
