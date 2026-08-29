import { Command } from 'commander';
import { runAgentAuthenticationPreflight } from '../../data/repository/agent_authentication_preflight';
import { createFixerQueryPort } from '../../infrastructure/composition/agent_capability_composition_root';
import { getCliDoPrompt } from '../../prompts';
import {
  buildDoAgentTasks,
  collectDoAuthenticationNotices,
  formatDoResponse,
  resolveDoOutputFormat,
  resolveDoPrompt,
} from './do_policy';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../utils/project_context_instruction';
import { getGitInfo, getCurrentBranch } from '../../cli_context';

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

    const prompt = resolveDoPrompt(options.prompt);

    if (!prompt) {
      console.log('❌ Please provide a prompt using -p or --prompt');
      process.exitCode = 1;
      return;
    }

    const agentTasks = buildDoAgentTasks(options);
    const authenticationNotices = collectDoAuthenticationNotices(agentTasks, runAgentAuthenticationPreflight);
    const authenticationError = authenticationNotices.find(({ severity }) => severity === 'error');
    if (authenticationError) {
      console.error(`❌ ${authenticationError.task} agent: ${authenticationError.message}`);
      process.exitCode = 1;
      return;
    }
    authenticationNotices
      .filter(({ severity }) => severity === 'warning')
      .forEach(({ task, message }) => console.warn(`⚠️ ${task} agent: ${message}`));

    const outputFormat = resolveDoOutputFormat(options.output);
    if (!outputFormat) {
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
        return;
      }

      const { text, sessionId } = result;
      console.log(formatDoResponse(text, sessionId, outputFormat));
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
