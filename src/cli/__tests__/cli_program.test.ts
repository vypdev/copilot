import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../command_registry', () => ({
  registerCliCommands: (program: unknown) => program,
}));

import { createCliProgram } from '../cli_program';

describe('CLI program metadata', () => {
  it('uses the published executable name and package version', () => {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    const program = createCliProgram();

    expect(program.name()).toBe('copilot');
    expect(program.version()).toBe(packageJson.version);
  });
});
