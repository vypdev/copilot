import { Command } from 'commander';
import { isInsideGitRepo, getGitInfo } from '../../cli_context';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { SetupPromptAdapter } from '../setup_prompt_adapter';
import { createSetupDoctorUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { createDefaultSetupConfiguration, mergeSetupConfiguration } from '../../application/policies/setup_configuration_policy';

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Verify Copilot workflows, Variables, Secrets, and setup PAT without changing repository configuration')
        .option('-t, --token <token>', 'Setup PAT (or PERSONAL_ACCESS_TOKEN from the environment)')
        .option('--config <path>', 'YAML or JSON setup configuration used as the expected contract')
        .option('--non-interactive', 'Do not prompt; use --token or PERSONAL_ACCESS_TOKEN', false)
        .action(async options => {
            const prompt = new SetupPromptAdapter({ interactive: !options.nonInteractive });
            try {
                const cwd = process.cwd();
                if (!isInsideGitRepo(cwd)) throw new Error('Run "copilot doctor" from the root of a git repository.');
                const gitInfo = getGitInfo();
                if ('error' in gitInfo) throw new Error(gitInfo.error);
                let token = getSetupToken(cwd, options.token);
                if (!token && !options.nonInteractive) token = await prompt.requestSetupPat();
                if (!token) throw new Error('A setup PAT is required. Use --token or PERSONAL_ACCESS_TOKEN. No .env file is supported.');
                const overrides = options.config ? loadSetupConfigurationOverrides(options.config) : {};
                const expected = mergeSetupConfiguration(createDefaultSetupConfiguration(), overrides);
                logInfo(`🩺 Checking Copilot configuration for ${gitInfo.owner}/${gitInfo.repo}...`);
                const healthy = await createSetupDoctorUseCase(prompt).execute({
                    owner: gitInfo.owner,
                    repository: gitInfo.repo,
                    setupToken: token,
                    configuration: expected,
                });
                if (!healthy) process.exitCode = 1;
            } catch (error) {
                logError(`Doctor failed: ${error instanceof Error ? error.message : String(error)}`);
                process.exitCode = 1;
            } finally {
                prompt.close();
            }
        });
}
