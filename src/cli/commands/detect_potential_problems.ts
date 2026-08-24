import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../utils/constants';
import { logError } from '../../utils/logger';
import { getGitInfo, getCurrentBranch } from '../../cli_context';
import { cleanCliArgument } from '../command_input_policy';
import { buildDetectPotentialProblemsParams, resolveDetectIssueNumber } from './detect_potential_problems_policy';

export function registerDetectPotentialProblemsCommand(program: Command): void {
  program
    .command('detect-potential-problems')
    .description(`${TITLE} - Detect potential problems in the branch (bugbot): report as comments on issue and PR`)
    .option('-i, --issue <number>', 'Issue number (required)', '')
    .option('-b, --branch <name>', 'Branch name (optional, defaults to current git branch)', '')
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
      if (resolveDetectIssueNumber(issue) === undefined) {
        console.log('❌ Provide a valid issue number with -i or --issue');
        return;
      }
      const params = buildDetectPotentialProblemsParams(options, gitInfo, getCurrentBranch());
      if (!params) return;
      try {
        await runLocalAction(params);
        process.exit(0);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('❌ Error running detect-potential-problems:', error.message);
        if (options.debug) console.error(err);
        process.exit(1);
      }
    });
}
