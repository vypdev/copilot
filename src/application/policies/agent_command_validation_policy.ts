import type { AgentConfiguration } from '../../domain/agent';
import { parseAgentCommand } from './agent_command_parser';

export function validateConfiguredAgentCommand(configuration: AgentConfiguration): void {
    const command = configuration.command?.trim();
    if (!command) throw new Error(`CLI command is required for ${configuration.provider}.`);
    const { args } = parseAgentCommand(command);
    validateCommandShape(configuration, args);
    validateModelSelection(configuration, args);
    validateProviderConfiguration(configuration, args);
    validateEffortSelection(configuration, args);
}

function validateCommandShape(configuration: AgentConfiguration, args: readonly string[]): void {
    if (configuration.provider !== 'codex' && args.includes('-')) {
        throw new Error(`${configuration.provider} command must not include the Codex stdin placeholder "-"; its prompt is passed as an argument.`);
    }
    if (!hasFlag(args, '--model') && !hasFlag(args, '-m')) {
        throw new Error(`${configuration.provider} command must select the model explicitly with --model.`);
    }
}

function validateModelSelection(configuration: AgentConfiguration, args: readonly string[]): void {
    const expectedModel = configuration.provider === 'opencode'
        ? `${configuration.modelProvider?.trim() || 'openai'}/${configuration.model.trim()}`
        : configuration.model.trim();
    const configuredModel = flagValue(args, ['--model', '-m']);
    if (configuredModel !== expectedModel) {
        throw new Error(`${configuration.provider} command must select configured model "${expectedModel}".`);
    }
}

function validateProviderConfiguration(configuration: AgentConfiguration, args: readonly string[]): void {
    if (configuration.provider !== 'codex') return;
    if (!hasConfig(args, 'model_provider')) {
        throw new Error('Codex command must select the model provider explicitly with --config model_provider=... .');
    }
    const expectedProvider = configuration.modelProvider?.trim() || 'openai';
    if (configValue(args, 'model_provider') !== expectedProvider) {
        throw new Error(`Codex command must select configured model provider "${expectedProvider}".`);
    }
}

function validateEffortSelection(configuration: AgentConfiguration, args: readonly string[]): void {
    const effort = configuration.effort?.trim();
    if (!effort) return;
    if (configuration.provider === 'codex') {
        if (!hasConfig(args, 'model_reasoning_effort')) {
            throw new Error('Codex command must select effort explicitly with --config model_reasoning_effort=... .');
        }
        if (configValue(args, 'model_reasoning_effort') !== effort) {
            throw new Error(`Codex command must select configured effort "${effort}".`);
        }
        return;
    }
    if (configuration.provider === 'cursor') {
        // Cursor's CLI does not expose a provider-independent effort flag.
        // Keep the value in the domain configuration for future CLI support,
        // but do not reject a valid custom command because of that advisory
        // setting.
        return;
    }
    if (!hasFlag(args, '--variant')) {
        throw new Error('OpenCode command must select effort explicitly with --variant ... .');
    }
    if (flagValue(args, ['--variant']) !== effort) {
        throw new Error(`OpenCode command must select configured effort "${effort}".`);
    }
}

function hasFlag(args: readonly string[], flag: string): boolean {
    return args.some((argument, index) => (argument === flag && index < args.length - 1) || argument.startsWith(`${flag}=`));
}

function flagValue(args: readonly string[], flags: readonly string[]): string | undefined {
    for (const [index, argument] of args.entries()) {
        const inlineFlag = flags.find((flag) => argument.startsWith(`${flag}=`));
        if (inlineFlag) return argument.slice(inlineFlag.length + 1);
        if (flags.includes(argument)) return args[index + 1];
    }
    return undefined;
}

function configValue(args: readonly string[], key: string): string | undefined {
    for (const [index, argument] of args.entries()) {
        const value = argument === '--config' || argument === '-c' ? args[index + 1] : argument;
        if (!value?.startsWith(`${key}=`)) continue;
        return value.slice(key.length + 1).replace(/^['"]/, '').replace(/['"]$/, '');
    }
    return undefined;
}

function hasConfig(args: readonly string[], key: string): boolean {
    return args.some((argument, index) => (
        (argument === '--config' || argument === '-c')
        && typeof args[index + 1] === 'string'
        && args[index + 1].startsWith(`${key}=`)
    ) || argument.startsWith(`${key}=`));
}
