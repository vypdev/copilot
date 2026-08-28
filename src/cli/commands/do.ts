import { Command } from 'commander';
import { runAgentAuthenticationPreflight } from '../../data/repository/agent_authentication_preflight';
import { createFixerQueryPort } from '../../infrastructure/composition/agent_capability_composition_root';
import { getCliDoPrompt } from '../../prompts';
import { buildDoAgentTasks, formatDoJsonResponse } from './do_policy';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../utils/project_context_instruction';
import { getGitInfo, getCurrentBranch } from '../../cli_context';
import { cleanCliArgument, joinCliArguments } from '../command_input_policy';

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
  .option('--fixer-effort <effort>', 'Fixer reasoning effort or model variant')

  .option('--fixer-model <model>', 'Fixer agent model')
  .option('--fixer-command <command>', 'Fixer CLI executable')
  .option('--output <format>', 'Output format (text|json)', 'text')
  .action(async (options) => {
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }

    const prompt = joinCliArguments(options.prompt);

    if (!prompt || prompt.length === 0) {
      console.log('❌ Please provide a prompt using -p or --prompt');
      process.exitCode = 1;
      return;
    }

    const agentTasks = buildDoAgentTasks(options);
    const authPreflights = [
      ['findings', agentTasks.findings],
      ['fixer', agentTasks.fixer],
    ] as const;
    for (const [task, configuration] of authPreflights) {
      const authPreflight = runAgentAuthenticationPreflight(configuration);
      if (authPreflight.check.status !== 'missing') continue;
      if (authPreflight.shouldFail) {
        console.error(`❌ ${task} agent: ${authPreflight.check.message}`);
        process.exitCode = 1;
        return;
      }
      if (authPreflight.mode === 'warn') console.warn(`⚠️ ${task} agent: ${authPreflight.check.message}`);
    }
    const outputFormat = cleanCliArgument(options.output) || 'text';
    if (outputFormat !== 'text' && outputFormat !== 'json') {
      console.error('❌ Output format must be text or json.');
      process.exitCode = 1;
      return;
    }

    try {
      const aiRepository = createFixerQueryPort();
      const fullPrompt = getCliDoPrompt({
        projectContextInstruction: `${PROJECT_CONTEXT_INSTRUCTION}\n\nRepository identity: ${gitInfo.owner}/${gitInfo.repo}\nCurrent branch: ${getCurrentBranch()}\nTreat this repository identity as authoritative context for the request.`,
        userPrompt: prompt,
      });
      const result = await aiRepository.fix({
        configuration: agentTasks.fixer,
        prompt: fullPrompt,
      });

      if (!result) {
        console.error('❌ Request failed while executing the configured agent CLI.');
        process.exit(1);
      }

      const { text, sessionId } = result;

      if (outputFormat === 'json') {
        console.log(formatDoJsonResponse(text, sessionId));
        return;
      }

      console.log('\n' + '='.repeat(80));
      console.log('🤖 RESPONSE (selected agent build execution)');
      console.log('='.repeat(80));
      console.log(`\n${text || '(No text response)'}\n`);
      console.log('Changes are applied directly in the workspace by the selected agent CLI.');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Error executing do:', err.message || error);
      if (options.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });
}
