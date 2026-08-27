import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CLI entrypoint boundaries', () => {
    const cliSource = readFileSync(join(__dirname, '..', '..', 'cli.ts'), 'utf8');

    it('keeps the executable entrypoint delegated to the CLI composition root', () => {
        expect(cliSource).toContain("from './cli/cli_program'");
        expect(cliSource).toContain('createCliProgram()');
        expect(cliSource).not.toContain("from 'commander'");
        expect(cliSource).not.toContain("from './cli/commands/");
    });
});
