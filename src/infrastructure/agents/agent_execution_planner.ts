import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
    accessSync,
    constants,
    existsSync,
    mkdirSync,
    mkdtempSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { buildProviderExecutionPolicy } from '../../application/policies/agent_execution/agent_execution_policy_dispatcher';
import type { AgentArtifactTemplate } from '../../application/policies/agent_execution/provider_execution_policy';
import type { AgentCapability, AgentConfiguration } from '../../domain/agent';
import {
    AGENT_EXECUTION_TIMEOUT_MAX_MS,
    AGENT_OUTPUT_MAX_BYTES,
    AGENT_PROMPT_MAX_BYTES,
    type AgentExecutionPlan,
    type AgentManagedArtifact,
} from '../../domain/agent_execution_plan';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { validateAgentExecutableSelection } from '../../application/policies/agent_executable_policy';
import { buildAgentCliEnvironment } from '../../data/repository/agent_authentication';
import { assertAgentRuntimeVersion, getAgentRuntimeManifest, getAgentRuntimeManifestEntry } from './agent_runtime_manifest';

export interface AgentExecutionPlanningRequest {
    readonly configuration: AgentConfiguration;
    readonly capability: AgentCapability;
    readonly prompt: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly timeoutMs: number;
    readonly cwd?: string;
    readonly maxOutputBytes?: number;
    readonly maxPromptBytes?: number;
    readonly outputSchema?: Record<string, unknown>;
}

export interface AgentExecutionPlanningSystem {
    resolveExecutable(executable: string, environment: NodeJS.ProcessEnv): string;
    readVersion(executable: string, environment: NodeJS.ProcessEnv): string;
    resolveWorkspace(cwd: string): string;
}

const DEFAULT_SYSTEM: AgentExecutionPlanningSystem = {
    resolveExecutable: resolveExecutablePath,
    readVersion(executable, environment) {
        return execFileSync(executable, ['--version'], {
            env: environment,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15_000,
        });
    },
    resolveWorkspace(cwd) {
        const requested = realpathSync(cwd);
        const root = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], {
            cwd: requested,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15_000,
        }).trim());
        if (requested !== root) throw new Error('Agent cwd must be the canonical repository root.');
        return root;
    },
};

export class AgentExecutionPlanner {
    constructor(private readonly system: AgentExecutionPlanningSystem = DEFAULT_SYSTEM) {}

    prepare(request: AgentExecutionPlanningRequest): AgentExecutionPlan {
        const limits = validateLimits(request);
        const sourceEnvironment = request.environment ?? process.env;
        let runtimeDirectory: string | undefined;
        try {
            const workspace = this.system.resolveWorkspace(request.cwd ?? process.cwd());
            rejectAmbientProviderConfiguration(request.configuration.provider, workspace);
            const manifest = getAgentRuntimeManifest();
            const runtime = getAgentRuntimeManifestEntry(request.configuration.provider);
            const requestedExecutable = request.configuration.executable?.trim() || runtime.executable;
            validateAgentExecutableSelection({
                provider: request.configuration.provider,
                executable: requestedExecutable,
            });
            const executable = this.system.resolveExecutable(requestedExecutable, sourceEnvironment);
            validateExecutableFile(executable);
            const safeEnvironment = buildAgentCliEnvironment(
                request.configuration.provider,
                sourceEnvironment,
                request.configuration.modelProvider,
            );
            const version = assertAgentRuntimeVersion(
                request.configuration.provider,
                this.system.readVersion(executable, safeEnvironment),
            );
            runtimeDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-runtime-'));
            const gitConfigPath = join(runtimeDirectory, 'gitconfig');
            const providerPolicy = buildProviderExecutionPolicy({
                configuration: request.configuration,
                capability: request.capability,
                workspace,
                runtimeDirectory,
                ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
            });
            const artifacts = materializeArtifacts([
                { path: gitConfigPath, contents: '', purpose: 'git-config' },
                ...providerPolicy.artifacts,
            ]);
            const environment = definedEnvironment({
                ...safeEnvironment,
                ...providerPolicy.environment,
                GIT_TERMINAL_PROMPT: '0',
                GIT_CONFIG_GLOBAL: gitConfigPath,
                GIT_CONFIG_NOSYSTEM: '1',
            });
            return {
                provider: request.configuration.provider,
                capability: request.capability,
                executable,
                argv: providerPolicy.argv,
                promptMode: providerPolicy.promptMode,
                outputProtocol: providerPolicy.outputProtocol,
                workspace,
                workspaceMode: providerPolicy.workspaceMode,
                childNetwork: 'deny',
                approval: 'never',
                sessionPersistence: false,
                output: providerPolicy.output,
                timeoutMs: limits.timeoutMs,
                maxPromptBytes: limits.maxPromptBytes,
                maxOutputBytes: limits.maxOutputBytes,
                environment,
                artifacts,
                runtimeDirectory,
                runtimeContract: {
                    provider: request.configuration.provider,
                    version,
                    manifestRevision: manifest.revision,
                },
            };
        } catch (error) {
            if (runtimeDirectory) rmSync(runtimeDirectory, { recursive: true, force: true });
            if (error instanceof AgentCliError) throw error;
            throw new AgentCliError(
                `Agent execution plan rejected: ${error instanceof Error ? error.message : String(error)}`,
                'configuration',
            );
        }
    }
}

function validateLimits(request: AgentExecutionPlanningRequest) {
    const timeoutMs = request.timeoutMs;
    const maxPromptBytes = request.maxPromptBytes ?? AGENT_PROMPT_MAX_BYTES;
    const maxOutputBytes = request.maxOutputBytes ?? AGENT_OUTPUT_MAX_BYTES;
    assertBoundedLimit('timeoutMs', timeoutMs, AGENT_EXECUTION_TIMEOUT_MAX_MS);
    assertBoundedLimit('maxPromptBytes', maxPromptBytes, AGENT_PROMPT_MAX_BYTES);
    assertBoundedLimit('maxOutputBytes', maxOutputBytes, AGENT_OUTPUT_MAX_BYTES);
    if (Buffer.byteLength(request.prompt, 'utf8') > maxPromptBytes) {
        throw new AgentCliError(`Agent CLI prompt exceeded the ${maxPromptBytes}-byte limit.`, 'configuration');
    }
    return { timeoutMs, maxPromptBytes, maxOutputBytes };
}

function assertBoundedLimit(name: string, value: number, maximum: number): void {
    if (!Number.isFinite(value) || value <= 0 || value > maximum) {
        throw new AgentCliError(`Agent CLI ${name} must be a finite positive number no greater than ${maximum}.`, 'configuration');
    }
}

function resolveExecutablePath(selected: string, environment: NodeJS.ProcessEnv): string {
    if (isAbsolute(selected)) return realpathSync(selected);
    const extensions = process.platform === 'win32'
        ? (environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    for (const directory of (environment.PATH || '').split(delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const candidate = join(directory, `${selected}${extension}`);
            try {
                accessSync(candidate, constants.X_OK);
                return realpathSync(candidate);
            } catch {
                // Continue through the trusted PATH candidates.
            }
        }
    }
    throw new Error(`Agent executable "${selected}" was not found on PATH.`);
}

function validateExecutableFile(path: string): void {
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('Agent executable must resolve to a regular file.');
    accessSync(path, constants.X_OK);
    if ((stats.mode & 0o022) !== 0) throw new Error('Agent executable must not be group- or world-writable.');
    if (typeof process.getuid === 'function') {
        const uid = process.getuid();
        if (stats.uid !== uid && stats.uid !== 0) throw new Error('Agent executable must be owned by the runner user or root.');
    }
}

function materializeArtifacts(templates: readonly AgentArtifactTemplate[]): AgentManagedArtifact[] {
    return templates.map((template) => {
        mkdirSync(dirname(template.path), { recursive: true, mode: 0o700 });
        writeFileSync(template.path, template.contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        return {
            path: template.path,
            sha256: createHash('sha256').update(template.contents).digest('hex'),
            purpose: template.purpose,
        };
    });
}

function rejectAmbientProviderConfiguration(provider: AgentConfiguration['provider'], workspace: string): void {
    const forbidden = provider === 'opencode'
        ? ['opencode.json', 'opencode.jsonc', '.opencode']
        : provider === 'cursor'
            ? ['.cursor/cli.json', '.cursor/sandbox.json', '.cursor/mcp.json', '.cursor/hooks.json']
            : [];
    const match = forbidden.find(path => existsSync(join(workspace, path)));
    if (match) throw new Error(`${provider} project configuration "${match}" is not allowed for managed execution.`);
}

function definedEnvironment(environment: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
    return Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
