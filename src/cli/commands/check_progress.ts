import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { getGitInfo } from '../../cli_context';
import { cleanCliArgument } from '../command_input_policy';
import { buildCheckProgressParams, parseIssueNumber } from './issue_command_policy';

export function registerCheckProgressCommand(program: Command): void {
  program
    .command('check-progress')
    .description(`${TITLE} - Check progress of an issue based on code changes`)
    .option('-i, --issue <number>', 'Issue number to check progress for (required)', '')
    .option('-b, --branch <name>', 'Branch name (optional, will try to determine from issue)')
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
      if (!issue) {
        console.log('❌ Please provide an issue number using -i or --issue');
        return;
      }
      if (parseIssueNumber(issue) === undefined) {
        console.log(`❌ Invalid issue number: ${issue}. Must be a positive number.`);
        return;
      }
      const params = buildCheckProgressParams(options, gitInfo);
      if (!params) return;
      try {
        await runLocalAction(params);
        process.exit(0);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('❌ Error checking progress:', error.message);
        if (options.debug) console.error(err);
        process.exit(1);
      }
    });
}
