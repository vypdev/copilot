import { Command } from 'commander';
import { TITLE } from '../../application/contracts/product_identity';
import { collectApprovalCheck, collectScope, collectSecret } from '../setup_command_options';
import { executeSetupCommand } from './setup_execution';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description(`${TITLE} - Interactive repository setup: select workflows, agents, Variables, labels, and issue types`)
    .option('-d, --debug', 'Debug mode', false)
    .option('-t, --token <token>', 'Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)')
    .option('--agent <provider>', 'Use one agent runtime for every setup task (codex|opencode|cursor)')
    .option('--features <features>', 'Comma-separated setup features, or "all" (for non-interactive setup)')
    .option('--issue-workflows <types>', 'Comma-separated issue workflow types, or "all" (for non-interactive setup)')
    .option('--agent-guidance <mode>', 'Generated agent guidance mode (prompt|create-if-missing|disabled)')
    .option('--config <path>', 'YAML or JSON file with setup overrides')
    .option('--pr-approval-mode <mode>', 'PR bot approval: recommend (new setup default), guarded, or off')
    .option('--pr-approval-check <identity>', 'Exact test producer name|source-App-ID|workflow-name; repeat for multiple checks', collectApprovalCheck, [])
    .option('--pr-approval-coverage-check <name>', 'Exact selected check that enforces the coverage budget')
    .option('--pr-approval-attest-producer', 'Confirm exact check/App/workflow identity and a coverage-enforcing CI step', false)
    .option('--non-interactive', 'Use defaults and config-file values without prompting', false)
    .option('--web', 'Run the optional local browser setup assistant (127.0.0.1 only)', false)
    .option('--yes', 'Apply the plan without the final confirmation prompt', false)
    .option('--confirm-unverifiable-write-permissions', 'Confirm that required PAT write permissions shown as Unverifiable were configured exactly as displayed', false)
    .option('--dry-run', 'Show the setup plan without changing files or GitHub', false)
    .option('--skip-variables', 'Do not create or update GitHub Repository Variables', false)
    .option('--skip-secrets', 'Do not validate or create/update GitHub Repository Secrets', false)
    .option('--variables-scope <scope>', 'Default Variable scope (repository|organization)')
    .option('--secrets-scope <scope>', 'Default Secret scope (repository|organization)')
    .option('--variables-visibility <visibility>', 'Organization Variable visibility (selected|private|all)')
    .option('--secrets-visibility <visibility>', 'Organization Secret visibility (selected|private|all)')
    .option('--variable-scope <name=scope>', 'Per-variable scope override; repeat as needed', collectScope, {})
    .option('--secret-scope <name=scope>', 'Per-secret scope override; repeat as needed', collectScope, {})
    .option('--update-workflows', 'Allow setup-managed workflows already in the repository to be updated', false)
    .option('--workflow-pat <token>', 'Workflow PAT for the bot account (prefer the hidden interactive prompt)')
    .option('--secret <name=value>', 'Secret value for non-interactive setup; repeat for each API key', collectSecret, {})
    .action(executeSetupCommand);
}
