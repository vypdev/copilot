import { Command } from 'commander';
import { runAgentAuthenticationPreflight } from '../../data/repository/agent_authentication_preflight';
import { createFixerQueryPort } from '../../infrastructure/composition/agent_capability_composition_root';
import { getCliDoPrompt } from '../../prompts';
import { buildDoAgentTasks, formatDoJsonResponse } from './do_policy';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { OPENCODE_PROJECT_CONTEXT_INSTRUCTION } from '../../utils/opencode_project_context_instruction';
import { getGitInfo, getCurrentBranch } from '../../cli_context';
import { cleanCliArgument, joinCliArguments } from '../command_input_policy';

export function registerDoCommand(program: Command): void {
program
  .command('do')
  .description(`${TITLE} - AI development assistant (OpenCode build agent; can edit files when run locally)`)
  .option('-p, --prompt <prompt...>', 'Prompt or question (required)', '')
  .option('-d, --debug', 'Debug mode', false)
  .option('--agent-provider <provider>', 'Agent provider (opencode|cursor|codex)', process.env.AGENT_PROVIDER || 'opencode')
  .option('--agent-model-provider <provider>', 'Provider of the selected model', process.env.AGENT_MODEL_PROVIDER || 'openai')
  .option('--agent-model <model>', 'Selected agent model', process.env.AGENT_MODEL || 'gpt-5.6-luna')
  .option('--agent-command <command>', 'CLI executable for the selected agent', process.env.AGENT_COMMAND)
  .option('--findings-provider <provider>', 'Findings agent provider', process.env.FINDINGS_PROVIDER)

  .option('--findings-model <model>', 'Findings agent model', process.env.FINDINGS_MODEL)
  .option('--findings-command <command>', 'Findings CLI executable', process.env.FINDINGS_COMMAND)
  .option('--fixer-provider <provider>', 'Fixer agent provider', process.env.FIXER_PROVIDER)

  .option('--fixer-model <model>', 'Fixer agent model', process.env.FIXER_MODEL)
  .option('--fixer-command <command>', 'Fixer CLI executable', process.env.FIXER_COMMAND)
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
      return;
    }

    const agentTasks = buildDoAgentTasks(options);
    const authPreflight = runAgentAuthenticationPreflight(agentTasks.findings);
    if (authPreflight.check.status === 'missing') {
      const message = `❌ ${authPreflight.check.message}`;
      if (authPreflight.shouldFail) {
        console.error(message);
        return;
      }
      if (authPreflight.mode === 'warn') console.warn(`⚠️ ${authPreflight.check.message}`);
    }
    const outputFormat = cleanCliArgument(options.output) || 'text';

    try {
      const aiRepository = createFixerQueryPort();
      const fullPrompt = getCliDoPrompt({
        projectContextInstruction: `${OPENCODE_PROJECT_CONTEXT_INSTRUCTION}\n\nRepository identity: ${gitInfo.owner}/${gitInfo.repo}\nCurrent branch: ${getCurrentBranch()}\nTreat this repository identity as authoritative context for the request.`,
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
      console.log('🤖 RESPONSE (OpenCode build agent)');
      console.log('='.repeat(80));
      console.log(`\n${text || '(No text response)'}\n`);
      console.log('Changes are applied directly in the workspace when OpenCode runs from the repo (e.g. opencode serve).');
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
