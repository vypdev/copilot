import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('GitHub provider port boundaries', () => {
    const applicationPortsDirectory = join(__dirname, '..', '..', 'application', 'ports');
    const infrastructurePortsDirectory = join(__dirname, '..', 'github', 'ports');

    it('does not retain the universal GitHub provider port module', () => {
        expect(existsSync(join(applicationPortsDirectory, 'github_provider_ports.ts'))).toBe(false);
    });

    it('keeps provider resolution contracts in infrastructure', () => {
        expect(existsSync(join(infrastructurePortsDirectory, 'github_client_provider_port.ts'))).toBe(true);
    });

    it('keeps the GraphQL transport contract in infrastructure', () => {
        expect(existsSync(join(infrastructurePortsDirectory, 'github_graphql_transport_port.ts'))).toBe(true);
    });

    it('keeps workflow provider protocol contracts in infrastructure', () => {
        expect(existsSync(join(applicationPortsDirectory, 'github_workflow_ports.ts'))).toBe(false);
        expect(existsSync(join(infrastructurePortsDirectory, 'github_workflow_provider_ports.ts'))).toBe(true);
        expect(existsSync(join(applicationPortsDirectory, 'workflow_run_ports.ts'))).toBe(true);
    });

    it('keeps Project Board identity provider protocols out of application', () => {
        const infrastructureIdentityPorts = join(infrastructurePortsDirectory, 'github_identity_provider_ports.ts');
        expect(existsSync(infrastructureIdentityPorts)).toBe(true);
        expect(existsSync(join(applicationPortsDirectory, 'github_identity_ports.ts'))).toBe(false);
    });

    it('keeps GitHub provider contracts grouped by capability', () => {
        for (const file of [
            'github_branch_provider_ports.ts',
            'github_release_provider_ports.ts',
            'github_identity_provider_ports.ts',
            'github_pull_request_provider_ports.ts',
            'github_issue_provider_ports.ts',
        ]) {
            expect(existsSync(join(infrastructurePortsDirectory, file))).toBe(true);
        }
    });

    it('does not leave provider-shaped GitHub contracts under application ports', () => {
        for (const file of [
            'github_branch_ports.ts',
            'github_release_ports.ts',
            'github_identity_ports.ts',
            'github_pull_request_ports.ts',
            'github_issue_ports.ts',
        ]) {
            expect(existsSync(join(applicationPortsDirectory, file))).toBe(false);
        }
    });
});
