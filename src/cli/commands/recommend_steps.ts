import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { getGitInfo } from '../../cli_context';
import { cleanCliArgument } from '../command_input_policy';
import { buildRecommendStepsParams, parseIssueNumber } from './issue_command_policy';

export function registerRecommendStepsCommand(program: Command): void {
  program
    .command('recommend-steps')
    .description(`${TITLE} - Recommend steps to implement an issue (OpenCode Plan agent)`)
    .option('-i, --issue <number>', 'Issue number (required)', '')
    .option('-d, --debug', 'Debug mode', false)
    .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)

    .option('--opencode-model <model>', 'OpenCode model', process.env.OPENCODE_MODEL)
    .action(async (options) => {
      const gitInfo = getGitInfo();
      if ('error' in gitInfo) {
        logError(gitInfo.error);
        process.exit(1);
      }
      const issue = cleanCliArgument(options.issue);
      if (parseIssueNumber(issue) === undefined) {
        console.log('❌ Provide a valid issue number with -i or --issue');
        return;
      }
      const params = buildRecommendStepsParams(options, gitInfo);
      if (!params) return;
      await runLocalAction(params);
    });
}
