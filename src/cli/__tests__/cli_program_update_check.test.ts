import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';

jest.mock('../command_registry', () => ({
    registerCliCommands: (program: Command) => {
        program.command('work').action(() => undefined);
        return program;
    },
}));

import { createCliProgram } from '../cli_program';

describe('CLI program update check hook', () => {
    it('checks for updates before a command and does not alter its execution', async () => {
        const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as {
            version: string;
        };
        const publishedVersion = '999.0.0';
        const execute = jest.fn().mockResolvedValue({
            installedVersion: packageJson.version,
            publishedVersion,
        });
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const program = createCliProgram({ execute });

        await program.parseAsync(['node', 'copilot', 'work']);

        expect(execute).toHaveBeenCalledWith(packageJson.version);
        expect(log).toHaveBeenCalledWith(`A new version (${publishedVersion}) is available. Run "copilot upgrade".`);
        log.mockRestore();
    });
});
