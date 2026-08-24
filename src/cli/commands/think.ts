import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { createIssueMetadataCompositionRoot } from '../../infrastructure/composition/issue_metadata_composition_root';
import { ACTIONS, INPUT_KEYS, OPENCODE_DEFAULT_MODEL, TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { getGitInfo } from '../../cli_context';
import { cleanCliArgument, joinCliArguments } from '../command_input_policy';

export function registerThinkCommand(program: Command): void {
program
  .command('think')
  .description(`${TITLE} - Deep code analysis and change proposals using AI reasoning`)
  .option('-i, --issue <number>', 'Issue number to process (optional)', '1')
  .option('-b, --branch <name>', 'Branch name', 'master')
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .option('-q, --question <question...>', 'Question or prompt for analysis', '')
  .option('--opencode-server-url <url>', 'OpenCode server URL (e.g. http://127.0.0.1:4096)', '')
  .option('--opencode-model <model>', `OpenCode model (e.g. ${OPENCODE_DEFAULT_MODEL}, openai/gpt-4o-mini)`, '')
  .option('--ai-ignore-files <ai-ignore-files>', 'AI ignore files', 'node_modules/*,build/*')
  .option('--include-reasoning <include-reasoning>', 'Include reasoning', 'false')
  .action(async (options) => {    
    const gitInfo = getGitInfo();
    
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }

    const question = joinCliArguments(options.question);

    if (!question || question.length === 0) {
      console.log('❌ Please provide a question or prompt using -q or --question');
      return;
    }

    const branch = cleanCliArgument(options.branch);
    const issueNumber = cleanCliArgument(options.issue);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
    const params: any = {
      [INPUT_KEYS.DEBUG]: options.debug.toString(),
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.THINK,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parseInt(issueNumber) || 1,
      [INPUT_KEYS.TOKEN]: options?.token?.length > 0 ? options.token : process.env.PERSONAL_ACCESS_TOKEN,

      [INPUT_KEYS.OPENCODE_MODEL]: options?.opencodeModel?.length > 0 ? options.opencodeModel : process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
      [INPUT_KEYS.AI_IGNORE_FILES]: options?.aiIgnoreFiles?.length > 0 ? options.aiIgnoreFiles : process.env.AI_IGNORE_FILES,
      [INPUT_KEYS.AI_INCLUDE_REASONING]: options?.includeReasoning?.length > 0 ? options.includeReasoning : process.env.AI_INCLUDE_REASONING,
      repo: {
        owner: gitInfo.owner,
        repo: gitInfo.repo,
      },
      commits: {
        ref: `refs/heads/${branch}`,
      },
    }

    // Set up issue context if provided
    const parsedIssueNumber = parseInt(issueNumber);
    if (issueNumber && parsedIssueNumber > 0) {
      const issueMetadataRepository = createIssueMetadataCompositionRoot();
      const isIssue = await issueMetadataRepository.isIssue(
        gitInfo.owner,
        gitInfo.repo,
        parsedIssueNumber,
        params[INPUT_KEYS.TOKEN] ?? ''
      );

      if (isIssue) {
        params.eventName = 'issue';
        params.issue = {
          number: parsedIssueNumber,
        }
        params.comment = {
          body: question,
        }
      }
    } else {
      // If no issue provided, set up as issue with question as body
      params.eventName = 'issue';
      params.issue = {
        number: 1,
      }
      params.comment = {
        body: question,
      }
    }

    params[INPUT_KEYS.WELCOME_TITLE] = '🤔 AI Reasoning Analysis';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [
      `Starting deep code analysis for ${gitInfo.owner}/${gitInfo.repo}/${branch}...`,
      `Question: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`,
    ];

    await runLocalAction(params);
  });
}
