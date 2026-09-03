import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { createCliUpdateCheckUseCase } from '../infrastructure/composition/cli_update_check_composition_root';
import { registerCliCommands } from './command_registry';
import { isUpdateCheckDisabled, shouldCheckForUpdates } from './cli_update_check_policy';
import { notifyAboutCliUpdate, type CliUpdateChecker } from './cli_update_notification';

function loadPackageVersion(): string {
  const packagePath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}

export function createCliProgram(
  updateChecker: CliUpdateChecker = createCliUpdateCheckUseCase(),
): Command {
  const installedVersion = loadPackageVersion();
  const program = new Command()
    .name('copilot')
    .description('GitHub workflow automation and repository management CLI')
    .version(installedVersion, '-V, --version', 'Display the installed Copilot version');
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    if (isUpdateCheckDisabled() || !shouldCheckForUpdates(actionCommand.name())) return;
    await notifyAboutCliUpdate(updateChecker, installedVersion);
  });
  return registerCliCommands(program);
}
