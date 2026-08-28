import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { parseAgentCommand } from './agent_command_parser';

export { defaultAgentCommand } from '../../domain/agent_command';

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
        const value = argument === '--config' || argument === '-c'
            ? args[index + 1]
            : argument;
        if (!value?.startsWith(`${key}=`)) continue;
        return value.slice(key.length + 1).replace(/^['"]/, '').replace(/['"]$/, '');
    }
    return undefined;
}

function hasCodexConfig(args: readonly string[], key: string): boolean {
    return args.some((argument, index) => (
        (argument === '--config' || argument === '-c')
        && typeof args[index + 1] === 'string'
        && args[index + 1].startsWith(`${key}=`)
    ) || argument.startsWith(`${key}=`));
}

/**
 * Custom commands are full overrides, so validate that they cannot silently
 * discard the selected model or supported effort setting.
 */
export function validateAgentCommand(configuration: AgentConfiguration): void {
    const command = configuration.command?.trim();
    if (!command) throw new Error(`CLI command is required for ${configuration.provider}.`);

    const { args } = parseAgentCommand(command);
    if (configuration.provider !== 'codex' && args.includes('-')) {
        throw new Error(`${configuration.provider} command must not include the Codex stdin placeholder "-"; its prompt is passed as an argument.`);
    }
    if (!hasFlag(args, '--model') && !hasFlag(args, '-m')) {
        throw new Error(`${configuration.provider} command must select the model explicitly with --model.`);
    }

    const expectedModel = configuration.provider === 'opencode'
        ? `${configuration.modelProvider?.trim() || 'openai'}/${configuration.model.trim()}`
        : configuration.model.trim();
    const configuredModel = flagValue(args, ['--model', '-m']);
    if (configuredModel !== expectedModel) {
        throw new Error(`${configuration.provider} command must select configured model "${expectedModel}".`);
    }

    if (configuration.provider === 'codex' && !hasCodexConfig(args, 'model_provider')) {
        throw new Error('Codex command must select the model provider explicitly with --config model_provider=... .');
    }
    if (configuration.provider === 'codex') {
        const configuredModelProvider = configValue(args, 'model_provider');
        const expectedModelProvider = configuration.modelProvider?.trim() || 'openai';
        if (configuredModelProvider !== expectedModelProvider) {
            throw new Error(`Codex command must select configured model provider "${expectedModelProvider}".`);
        }
    }

    if (configuration.effort?.trim()) {
        if (configuration.provider === 'codex' && !hasCodexConfig(args, 'model_reasoning_effort')) {
            throw new Error('Codex command must select effort explicitly with --config model_reasoning_effort=... .');
        }
        if (configuration.provider === 'codex' && configValue(args, 'model_reasoning_effort') !== configuration.effort.trim()) {
            throw new Error(`Codex command must select configured effort "${configuration.effort.trim()}".`);
        }
        if (configuration.provider === 'opencode' && !hasFlag(args, '--variant')) {
            throw new Error('OpenCode command must select effort explicitly with --variant ... .');
        }
        if (configuration.provider === 'opencode' && flagValue(args, ['--variant']) !== configuration.effort.trim()) {
            throw new Error(`OpenCode command must select configured effort "${configuration.effort.trim()}".`);
        }
    }
}

export function cliInstallationHint(provider: AgentProvider): string {
    switch (provider) {
        case 'codex':
            return 'Install the OpenAI Codex CLI and verify `codex exec --help` on the runner.';
        case 'cursor':
            return 'Install the Cursor CLI from https://cursor.com/install and verify `agent --help` on the runner.';
        case 'opencode':
            return 'Install OpenCode and verify `opencode run --help` on the runner.';
    }
}
