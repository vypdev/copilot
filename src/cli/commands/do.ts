import { Command } from 'commander';
import { TITLE } from '../../utils/constants';
import { runDoCommand, type DoCommandOptions } from './do_command_handler';

export function registerDoCommand(program: Command): void {
    program
        .command('do')
        .description(`${TITLE} - AI development assistant (selected build agent; can edit files when run locally)`)
        .option('-p, --prompt <prompt...>', 'Prompt or question (required)', '')
        .option('-d, --debug', 'Debug mode', false)
        .option('--agent-provider <provider>', 'Agent provider (codex|opencode|cursor)')
        .option('--agent-model-provider <provider>', 'Provider of the selected model')
        .option('--agent-model <model>', 'Selected agent model')
        .option('--agent-effort <effort>', 'Reasoning effort or provider-specific model variant')
        .option('--agent-command <command>', 'CLI executable for the selected agent')
        .option('--findings-provider <provider>', 'Findings agent provider')
        .option('--findings-model-provider <provider>', 'Findings model provider')
        .option('--findings-effort <effort>', 'Findings reasoning effort or model variant')
        .option('--findings-model <model>', 'Findings agent model')
        .option('--findings-command <command>', 'Findings CLI executable')
        .option('--fixer-provider <provider>', 'Fixer agent provider')
        .option('--fixer-model-provider <provider>', 'Fixer model provider')
        .option('--fixer-effort <effort>', 'Fixer reasoning effort or provider-specific model variant')
        .option('--fixer-model <model>', 'Fixer model')
        .option('--fixer-command <command>', 'Fixer CLI executable')
        .option('--output <format>', 'Output format (text|json)', 'text')
        .action((options: DoCommandOptions) => runDoCommand(options));
}
