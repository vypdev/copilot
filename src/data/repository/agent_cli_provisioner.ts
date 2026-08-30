import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { parseAgentCommand } from '../../application/policies/agent_command_parser';
import {
    DEFAULT_AGENT_EXECUTABLES,
    provisioningDisabledError,
    resolveAgentProvisioningMode,
    shouldSkipProvisioning,
} from './agent_cli_provisioning_policy';

export type AgentCliProvisioningEnvironment = NodeJS.ProcessEnv;

export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'command'>;

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

function installPackageGlobally(packageName: string, version: string): void {
    // npm uses the runner's system Node directly and avoids the Intel macOS
    // SEA binary issue that can affect Corepack-managed pnpm installations.
    execFileSync('npm', ['install', '--global', `${packageName}@${version}`], { stdio: 'inherit' });
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
    const normalized = version?.trim();
    if (!normalized || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)) {
        throw new Error(`${packageName} CLI is not installed and ${versionVariable} must contain a pinned semantic version (for example 1.2.3). Preinstall the CLI or set ${versionVariable} to a pinned version.`);
    }
    return normalized;
}

function requireInstallerChecksum(checksum: string | undefined): string {
    if (!checksum?.match(/^[a-f0-9]{64}$/i)) {
        throw new Error('CURSOR_INSTALLER_SHA256 must be provided for verified Cursor provisioning.');
    }
    return checksum;
}

const DEFAULT_SYSTEM: AgentCliProvisioningSystem = {
    executableExists,
    installPackage: installPackageGlobally,
    installCursor,
};

export class AgentCliProvisioner {
    private readonly provisionedExecutables = new Set<string>();

    constructor(private readonly system: AgentCliProvisioningSystem = DEFAULT_SYSTEM) {}

    provision(target: AgentCliProvisioningTarget, environment: AgentCliProvisioningEnvironment = process.env): void {
        const provider = typeof target === 'string' ? target : target.provider;
        const configuredCommand = typeof target === 'string' ? undefined : target.command;
        const executable = configuredCommand ? parseAgentCommand(configuredCommand).executable : DEFAULT_AGENT_EXECUTABLES[provider];
        const mode = resolveAgentProvisioningMode(environment.AGENT_PROVISIONING);

        if (shouldSkipProvisioning(
            mode,
            executable,
            this.provisionedExecutables,
            this.system.executableExists(executable, environment),
        )) return;
        if (mode === 'disabled') {
            throw provisioningDisabledError(provider, executable);
        }

        this.installProvider(provider, environment);
        this.assertInstalled(executable, provider, environment);
        this.provisionedExecutables.add(executable);
    }

    private installProvider(provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        const installers: Record<AgentProvider, () => void> = {
            codex: () => this.system.installPackage('@openai/codex', requirePinnedVersion('@openai/codex', environment.CODEX_VERSION, 'CODEX_VERSION')),
            opencode: () => this.system.installPackage('opencode-ai', requirePinnedVersion('opencode-ai', environment.OPENCODE_VERSION, 'OPENCODE_VERSION')),
            cursor: () => this.system.installCursor(requireInstallerChecksum(environment.CURSOR_INSTALLER_SHA256)),
        };
        installers[provider]();
    }

    private assertInstalled(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        if (!this.system.executableExists(executable, environment)) {
            throw new Error(`The ${provider} CLI was provisioned but executable "${executable}" is not available on PATH.`);
        }
    }
}
