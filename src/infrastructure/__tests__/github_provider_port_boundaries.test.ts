import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GitHub provider port boundaries', () => {
    const portsDirectory = join(__dirname, '..', '..', 'application', 'ports');

    it('does not retain the universal GitHub provider port module', () => {
        expect(existsSync(join(portsDirectory, 'github_provider_ports.ts'))).toBe(false);
    });

    it('keeps provider resolution contracts in infrastructure', () => {
        expect(existsSync(join(portsDirectory, '..', '..', 'infrastructure', 'github', 'ports', 'github_client_provider_port.ts'))).toBe(true);
    });

    it('keeps the GraphQL transport contract in infrastructure', () => {
        expect(existsSync(join(portsDirectory, '..', '..', 'infrastructure', 'github', 'ports', 'github_graphql_transport_port.ts'))).toBe(true);
    });

    it('keeps workflow provider protocol contracts in infrastructure', () => {
        expect(existsSync(join(portsDirectory, 'github_workflow_ports.ts'))).toBe(false);
        expect(existsSync(join(
            portsDirectory,
            '..',
            '..',
            'infrastructure',
            'github',
            'ports',
            'github_workflow_provider_ports.ts',
        ))).toBe(true);
        expect(existsSync(join(portsDirectory, 'workflow_run_ports.ts'))).toBe(true);
    });

    it('keeps Project Board identity provider protocols out of application', () => {
        const infrastructureIdentityPorts = join(
            portsDirectory,
            '..',
            '..',
            'infrastructure',
            'github',
            'ports',
            'github_identity_provider_ports.ts',
        );

        expect(existsSync(infrastructureIdentityPorts)).toBe(true);
        const applicationIdentityPorts = readFileSync(join(portsDirectory, 'github_identity_ports.ts'), 'utf8');
        expect(applicationIdentityPorts).not.toContain('GithubRepositoryContextClient');
        expect(applicationIdentityPorts).not.toContain('GithubOwnerTypeClient');
    });

    it('keeps GitHub provider contracts grouped by capability', () => {
        for (const file of [
            'github_branch_ports.ts',
            'github_release_ports.ts',
            'github_identity_ports.ts',
            'github_pull_request_ports.ts',
            'github_issue_ports.ts',
        ]) {
            expect(existsSync(join(portsDirectory, file))).toBe(true);
        }
    });
});
