import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { parseAgentCommand } from '../../application/policies/agent_command_parser';

export interface AgentCliProvisioningEnvironment extends NodeJS.ProcessEnv {
    codexVersion?: string;
    opencodeVersion?: string;
    cursorInstallerSha256?: string;
}

export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'command'>;

const DEFAULT_EXECUTABLES: Readonly<Record<AgentProvider, string>> = {
    codex: 'codex',
    opencode: 'opencode',
    cursor: 'agent',
};

function executableExists(executable: string, environment: NodeJS.ProcessEnv): boolean {
    if (isAbsolute(executable) || executable.includes('/')) {
        try {
            accessSync(executable, constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    const pathEntries = (environment.PATH || '').split(delimiter).filter(Boolean);
    const extensions = process.platform === 'win32'
        ? (environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    return pathEntries.some((directory) => extensions.some((extension) => {
        try {
            accessSync(join(directory, `${executable}${extension}`), constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }));
}

export class AgentCliProvisioner {
    private readonly provisionedExecutables = new Set<string>();

    provision(target: AgentCliProvisioningTarget, environment: AgentCliProvisioningEnvironment = process.env): void {
        const provider = typeof target === 'string' ? target : target.provider;
        const configuredCommand = typeof target === 'string' ? undefined : target.command;
        const executable = configuredCommand ? parseAgentCommand(configuredCommand).executable : DEFAULT_EXECUTABLES[provider];
        const mode = this.resolveMode(environment.AGENT_PROVISIONING);

        if (this.provisionedExecutables.has(executable)) return;
        if (mode !== 'always' && executableExists(executable, environment)) return;
        if (mode === 'disabled') {
            throw new Error(`Agent provisioning is disabled and the ${provider} CLI executable "${executable}" is not available.`);
        }

        switch (provider) {
            case 'codex':
                this.installPnpmPackage('@openai/codex', environment.codexVersion || environment.CODEX_VERSION, 'CODEX_VERSION');
                this.assertInstalled(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
            case 'opencode':
                this.installPnpmPackage('opencode-ai', environment.opencodeVersion || environment.OPENCODE_VERSION, 'OPENCODE_VERSION');
                this.assertInstalled(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
            case 'cursor':
                this.installCursor(environment.cursorInstallerSha256 || environment.CURSOR_INSTALLER_SHA256);
                this.assertInstalled(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
        }
    }

    private resolveMode(value: string | undefined): 'auto' | 'always' | 'disabled' {
        const mode = value?.trim().toLowerCase() || 'auto';
        if (mode === 'auto' || mode === 'always' || mode === 'disabled') return mode;
        throw new Error('AGENT_PROVISIONING must be one of: auto, always, disabled.');
    }

    private assertInstalled(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        if (!executableExists(executable, environment)) {
            throw new Error(`The ${provider} CLI was provisioned but executable "${executable}" is not available on PATH.`);
        }
    }

    private installPnpmPackage(packageName: string, version: string | undefined, versionVariable: string): void {
        if (!version?.trim()) throw new Error(`${packageName} CLI is not installed and ${versionVariable} is not configured. Preinstall the CLI or set ${versionVariable} to a pinned version.`);
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
