import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { registerCliCommands } from './command_registry';

dotenv.config();

function loadPackageVersion(): string {
  const packagePath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}

export function createCliProgram(): Command {
  const program = new Command()
    .name('copilot')
    .description('GitHub workflow automation and repository management CLI')
    .version(loadPackageVersion(), '-V, --version', 'Display the installed Copilot version');
  return registerCliCommands(program);
}
