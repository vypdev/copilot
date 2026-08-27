import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('agent port boundaries', () => {
    const portsDirectory = join(__dirname, '..');

    it('does not retain a universal agent ports module', () => {
        expect(existsSync(join(portsDirectory, 'agent_ports.ts'))).toBe(false);
    });

    it('keeps agent contracts separated by capability', () => {
        for (const file of [
            'agent_configuration_ports.ts',
            'agent_findings_ports.ts',
            'agent_fixer_ports.ts',
        ]) {
            expect(existsSync(join(portsDirectory, file))).toBe(true);
        }
    });
});
