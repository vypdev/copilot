import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('organization and project port boundaries', () => {
    const portsDirectory = join(__dirname, '..');

    it('does not retain universal organization or project board modules', () => {
        expect(existsSync(join(portsDirectory, 'organization_ports.ts'))).toBe(false);
        expect(existsSync(join(portsDirectory, 'project_board_ports.ts'))).toBe(false);
    });

    it('keeps organization capabilities separated', () => {
        for (const file of [
            'organization_members_ports.ts',
            'authenticated_user_ports.ts',
            'actor_authorization_ports.ts',
        ]) {
            expect(existsSync(join(portsDirectory, file))).toBe(true);
        }
    });

    it('keeps project board capabilities separated', () => {
        for (const file of [
            'project_detail_ports.ts',
            'project_board_query_ports.ts',
            'project_board_link_ports.ts',
            'project_board_command_ports.ts',
        ]) {
            expect(existsSync(join(portsDirectory, file))).toBe(true);
        }
    });
});
