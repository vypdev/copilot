import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../application/contracts/product_identity';
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
    .option('-t, --token <token>', 'Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)')
    .option('--dry-run', 'Run the complete analysis without publishing or resolving anything', false)
    .option('--effort <effort>', 'Review effort (low|default|high|smart)', 'smart')
    .option('--trace-rules', 'Include applied rule sources in the review summary', false)
    .option('--no-suggestions', 'Disable inline GitHub suggested changes')
    .option('--output <format>', 'Output format (text|json)', 'text')
    .action(async (options) => {
      const gitInfo = getGitInfo();
      if ('error' in gitInfo) {
        logError(gitInfo.error);
        process.exit(1);
      }
      const issue = cleanCliArgument(options.issue);
      if (resolveDetectIssueNumber(issue) === undefined) {
        console.log('❌ Provide a valid issue number with -i or --issue');
        process.exitCode = 1;
        return;
      }
      const output = cleanCliArgument(options.output).toLowerCase() || 'text';
      if (output !== 'text' && output !== 'json') {
        console.error('❌ Output format must be text or json.');
        process.exitCode = 1;
        return;
      }
      const effort = cleanCliArgument(options.effort).toLowerCase() || 'smart';
      if (!['low', 'default', 'high', 'smart'].includes(effort)) {
        console.error('❌ Review effort must be low, default, high, or smart.');
        process.exitCode = 1;
        return;
      }
      const params = buildDetectPotentialProblemsParams({ ...options, effort }, gitInfo, getCurrentBranch());
      if (!params) return;
      try {
        const results = await runLocalAction(params, { render: output !== 'json' });
        if (output === 'json') {
          console.log(JSON.stringify({
            success: results.every((result) => result.success),
            dryRun: Boolean(options.dryRun),
            results: results.map((result) => ({
              id: result.id,
              success: result.success,
              executed: result.executed,
              steps: result.steps,
              errors: result.errors.map((error) => error.message),
              payload: result.payload,
            })),
          }, null, 2));
        }
        process.exitCode = results.every((result) => result.success) ? 0 : 1;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('❌ Error running detect-potential-problems:', error.message);
        if (options.debug) console.error(err);
        process.exit(1);
      }
    });
}
