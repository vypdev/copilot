import type { CopilotCommandName } from '../../domain/copilot_command';
import type { CopilotCommandValidationReason } from '../../domain/copilot_command_validation';

const COMMAND_HELP_URL = 'https://docs.page/vypdev/copilot/issues/comment-commands';
const EXAMPLES: Readonly<Record<CopilotCommandName, string>> = Object.freeze({
  help: '/copilot help', plan: '/copilot plan', clarify: '/copilot clarify', estimate: '/copilot estimate',
  'test-plan': '/copilot test-plan', status: '/copilot status', 'sdd-diff': '/copilot sdd-diff',
  doctor: '/copilot doctor', history: '/copilot history', description: '/copilot description',
  explain: '/copilot explain', diagnose: '/copilot diagnose', analyze: '/copilot analyze',
  review: '/copilot review', findings: '/copilot findings', recheck: '/copilot recheck',
  fix: '/copilot fix <finding-id>', dismiss: '/copilot dismiss <finding-id>',
  implement: '/copilot implement <request>', remember: '/copilot remember <rule>',
  'sync-branch': '/copilot sync-branch --dry-run',
});

/** Insert protected syntax/destination after localization, never from the rejected input. */
export function commandValidationPresentationVariables(
  reason: CopilotCommandValidationReason,
  command: unknown,
): Readonly<Record<string, string>> {
  let example = typeof command === 'string' && Object.prototype.hasOwnProperty.call(EXAMPLES, command)
    ? EXAMPLES[command as CopilotCommandName] : EXAMPLES.help;
  if (reason === 'comment-command-finding-quoting' && (command === 'fix' || command === 'dismiss')) {
    example = '/copilot ' + command + ' "path:line:finding with spaces"';
  } else if (reason.startsWith('comment-command-review-')
      && ['analyze', 'review', 'findings', 'recheck'].some(value => value === command)) {
    example = '/copilot ' + command + (reason === 'comment-command-review-boolean' ? ' dry-run=true' : ' effort=smart');
  }
  return Object.freeze({ commandExample: '`' + example + '`', commandHelp: COMMAND_HELP_URL,
    commandPrefix: '`/copilot`', syncOptions: '`--dry-run`, `--no-agent`, `--from <parent-branch>`, `--from=<parent-branch>`' });
}
