import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('issue port boundaries', () => {
    const portsDirectory = join(__dirname, '..');

    it('does not retain a universal issue ports module', () => {
        expect(existsSync(join(portsDirectory, 'issue_ports.ts'))).toBe(false);
    });

    it('keeps issue contracts in capability-specific modules', () => {
        const expected = [
            'issue_description_ports.ts',
            'issue_identity_ports.ts',
            'issue_title_ports.ts',
            'issue_lifecycle_ports.ts',
            'issue_management_ports.ts',
        ];
        for (const file of expected) {
            expect(existsSync(join(portsDirectory, file))).toBe(true);
        }

        const sourceFiles = [
            'issue_use_case.ts',
            'pull_request_use_case.ts',
            'comment_automation_use_case.ts',
        ];
        for (const file of sourceFiles) {
            const source = readFileSync(join(portsDirectory, '..', 'usecases', file), 'utf8');
            expect(source).not.toContain('ports/issue_ports');
        }
    });
});
