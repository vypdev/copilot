import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider } from '../model/agent';

export interface AgentCliProvisioningEnvironment {
    codexVersion?: string;
    opencodeVersion?: string;
    cursorInstallerSha256?: string;
}

export class AgentCliProvisioner {
    provision(provider: AgentProvider, environment: AgentCliProvisioningEnvironment = process.env): void {
        switch (provider) {
            case 'codex':
                this.installPnpmPackage('@openai/codex', environment.codexVersion);
                return;
            case 'opencode':
                this.installPnpmPackage('opencode-ai', environment.opencodeVersion);
                return;
            case 'cursor':
                this.installCursor(environment.cursorInstallerSha256);
                return;
        }
    }

    private installPnpmPackage(packageName: string, version: string | undefined): void {
        if (!version?.trim()) throw new Error(`${packageName} version is required for reproducible provisioning.`);
        execFileSync('corepack', ['pnpm', 'add', '--global', `${packageName}@${version}`], { stdio: 'inherit' });
    }

    private installCursor(expectedSha256: string | undefined): void {
        if (!expectedSha256?.match(/^[a-f0-9]{64}$/i)) {
            throw new Error('CURSOR_INSTALLER_SHA256 must be provided for verified Cursor provisioning.');
        }
        const directory = mkdtempSync(join(tmpdir(), 'copilot-cursor-installer-'));
        const installer = join(directory, 'install.sh');
        try {
            execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', 'https://cursor.com/install', '--output', installer], { stdio: 'inherit' });
            const actualSha256 = createHash('sha256').update(readFileSync(installer)).digest('hex');
            if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
                throw new Error('Cursor installer checksum mismatch.');
            }
            execFileSync('bash', [installer], { stdio: 'inherit' });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }
}
