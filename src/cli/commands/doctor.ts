import { Command } from 'commander';
import { isInsideGitRepo, getGitInfo } from '../../cli_context';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { createSetupDoctorUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { createDefaultSetupConfiguration, mergeSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { toApplicationError } from '../../application/errors/application_error';
import { SetupDoctorPresenter } from '../setup_doctor_presenter';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Verify Copilot workflows, Variables, Secrets, and setup PAT without changing repository configuration')
        .option('-t, --token <token>', 'Setup PAT (or PERSONAL_ACCESS_TOKEN from the environment)')
        .option('--config <path>', 'YAML or JSON setup configuration used as the expected contract')
        .option('--non-interactive', 'Do not prompt; use --token or PERSONAL_ACCESS_TOKEN', false)
        .action(async options => {
            const terminal = options.nonInteractive ? undefined : createInteractiveTerminalDriver();
            const credentialPrompt = new SetupCredentialPromptAdapter(terminal, {});
            try {
                if (!options.nonInteractive && !terminal) {
                    throw new Error('Interactive doctor requires a terminal. Use --non-interactive with --token.');
                }
                const cwd = process.cwd();
                if (!isInsideGitRepo(cwd)) throw new Error('Run "copilot doctor" from the root of a git repository.');
                const gitInfo = getGitInfo();
                if ('error' in gitInfo) throw new Error(gitInfo.error);
                let token = getSetupToken(cwd, options.token);
                if (!token && !options.nonInteractive) token = await credentialPrompt.requestSetupPat();
                if (!token) throw new Error('A setup PAT is required. Use --token or PERSONAL_ACCESS_TOKEN. No .env file is supported.');
                const overrides = options.config ? loadSetupConfigurationOverrides(options.config) : {};
                const expected = mergeSetupConfiguration(createDefaultSetupConfiguration(), overrides);
                logInfo(`🩺 Checking Copilot configuration for ${gitInfo.owner}/${gitInfo.repo}...`);
                const report = await createSetupDoctorUseCase().execute({
                    owner: gitInfo.owner,
                    repository: gitInfo.repo,
                    setupToken: token,
                    configuration: expected,
                });
                new SetupDoctorPresenter().present(report);
                if (!report.healthy) process.exitCode = 1;
            } catch (error) {
                if (error instanceof SetupTerminalCancelledError) {
                    logInfo('Doctor cancelled. No repository configuration was changed.');
                    process.exitCode = 130;
                    return;
                }
                logError(toApplicationError(error, 'workflow.failed', 'Doctor failed.'));
                process.exitCode = 1;
            } finally {
                terminal?.close();
            }
        });
}
