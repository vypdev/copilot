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
        const execute = jest.fn().mockResolvedValue({ installedVersion: '3.3.0', publishedVersion: '3.4.0' });
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const program = createCliProgram({ execute });

        await program.parseAsync(['node', 'copilot', 'work']);

        expect(execute).toHaveBeenCalledWith('3.3.0');
        expect(log).toHaveBeenCalledWith('A new version (3.4.0) is available. Run "copilot upgrade".');
        log.mockRestore();
    });
});
