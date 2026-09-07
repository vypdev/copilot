import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../application/contracts/product_identity';
import { logError } from '../../utils/logger';
import { getGitInfo } from '../../cli_context';
import { cleanCliArgument } from '../command_input_policy';
import { buildRecommendStepsParams, parseIssueNumber } from './issue_command_policy';

export function registerRecommendStepsCommand(program: Command): void {
  program
    .command('recommend-steps')
    .description(`${TITLE} - Recommend steps to implement an issue (configured agent)`)
    .option('-i, --issue <number>', 'Issue number (required)', '')
    .option('-d, --debug', 'Debug mode', false)
    .option('-t, --token <token>', 'Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)')
    .action(async (options) => {
      const gitInfo = getGitInfo();
      if ('error' in gitInfo) {
        logError(gitInfo.error);
        process.exitCode = 1;
        return;
      }
      const issue = cleanCliArgument(options.issue);
      if (parseIssueNumber(issue) === undefined) {
        console.log('❌ Provide a valid issue number with -i or --issue');
        process.exitCode = 1;
        return;
      }
      const params = buildRecommendStepsParams(options, gitInfo);
      if (!params) return;
      try {
        await runLocalAction(params);
      } catch (error: unknown) {
        console.error('❌ Error recommending steps:', error instanceof Error ? error.message : String(error));
        if (options.debug) console.error(error);
        process.exitCode = 1;
      }
    });
}
