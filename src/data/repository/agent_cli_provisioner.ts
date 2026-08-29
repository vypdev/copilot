import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { parseAgentCommand } from '../../application/policies/agent_command_parser';

export type AgentCliProvisioningEnvironment = NodeJS.ProcessEnv;

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

export interface AgentCliProvisioningSystem {
    executableExists(executable: string, environment: AgentCliProvisioningEnvironment): boolean;
    installPackage(packageName: string, version: string): void;
    installCursor(expectedSha256: string): void;
}

function installPnpmPackage(packageName: string, version: string): void {
    execFileSync('corepack', ['pnpm', 'add', '--global', `${packageName}@${version}`], { stdio: 'inherit' });
}

function installCursor(expectedSha256: string): void {
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

function requirePinnedVersion(packageName: string, version: string | undefined, versionVariable: string): string {
    if (!version?.trim()) throw new Error(`${packageName} CLI is not installed and ${versionVariable} is not configured. Preinstall the CLI or set ${versionVariable} to a pinned version.`);
    return version.trim();
}

function requireInstallerChecksum(checksum: string | undefined): string {
    if (!checksum?.match(/^[a-f0-9]{64}$/i)) {
        throw new Error('CURSOR_INSTALLER_SHA256 must be provided for verified Cursor provisioning.');
    }
    return checksum;
}

const DEFAULT_SYSTEM: AgentCliProvisioningSystem = {
    executableExists,
    installPackage: installPnpmPackage,
    installCursor,
};

export class AgentCliProvisioner {
    private readonly provisionedExecutables = new Set<string>();

    constructor(private readonly system: AgentCliProvisioningSystem = DEFAULT_SYSTEM) {}

    provision(target: AgentCliProvisioningTarget, environment: AgentCliProvisioningEnvironment = process.env): void {
        const provider = typeof target === 'string' ? target : target.provider;
        const configuredCommand = typeof target === 'string' ? undefined : target.command;
        const executable = configuredCommand ? parseAgentCommand(configuredCommand).executable : DEFAULT_EXECUTABLES[provider];
        const mode = this.resolveMode(environment.AGENT_PROVISIONING);

        if (this.provisionedExecutables.has(executable)) return;
        if (mode !== 'always' && this.system.executableExists(executable, environment)) return;
        if (mode === 'disabled') {
            throw new Error(`Agent provisioning is disabled and the ${provider} CLI executable "${executable}" is not available.`);
        }

        switch (provider) {
            case 'codex':
                this.system.installPackage('@openai/codex', requirePinnedVersion('@openai/codex', environment.CODEX_VERSION, 'CODEX_VERSION'));
                this.assertInstalled(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
            case 'opencode':
                this.system.installPackage('opencode-ai', requirePinnedVersion('opencode-ai', environment.OPENCODE_VERSION, 'OPENCODE_VERSION'));
                this.assertInstalled(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
            case 'cursor':
                this.system.installCursor(requireInstallerChecksum(environment.CURSOR_INSTALLER_SHA256));
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
        if (!this.system.executableExists(executable, environment)) {
            throw new Error(`The ${provider} CLI was provisioned but executable "${executable}" is not available on PATH.`);
        }
    }
}
