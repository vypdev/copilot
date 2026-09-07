import * as exec from '@actions/exec';
import type { GitCommitPort } from '../application/ports/git_ports';
import { buildGitAuthenticationEnvironment } from './git_authentication_environment';
import { prepareUntrustedCommandEnvironment } from './untrusted_command_environment';

type GitCommandOptions = { stdout?: (data: Buffer) => void; env?: Record<string, string>; untrusted?: boolean };
type GitCommandExecutor = (program: string, args: string[], options?: GitCommandOptions) => Promise<number>;

export class GitCommitAdapter implements GitCommitPort {
    constructor(
        private readonly executeCommand: GitCommandExecutor = (program, args, options) => options
            ? exec.exec(program, args, {
                ...(options.stdout ? { listeners: { stdout: options.stdout } } : {}),
                ...(options.env ? { env: options.env } : {}),
            })
            : exec.exec(program, args),
    ) {}

    async execute(program: string, args: string[], options?: GitCommandOptions): Promise<number> {
        if (!options?.untrusted) return options ? this.executeCommand(program, args, options) : this.executeCommand(program, args);
        if (options.env) throw new Error('Untrusted command execution does not accept a caller-supplied environment.');
        const runtime = prepareUntrustedCommandEnvironment();
        try {
            return await this.executeCommand(program, args, {
                ...(options.stdout ? { stdout: options.stdout } : {}),
                env: runtime.environment,
            });
        } finally {
            runtime.cleanup();
        }
    }

    async configureAuthor(name: string, email: string): Promise<void> {
        await this.execute('git', ['config', 'user.name', name]);
        await this.execute('git', ['config', 'user.email', email]);
    }

    async fetch(branch: string, token?: string): Promise<void> {
        await this.executeAuthenticated(['fetch', 'origin', branch], token);
    }

    async stageAll(): Promise<void> {
        await this.execute('git', ['add', '-A']);
    }

    async stagePaths(paths: string[]): Promise<void> {
        if (paths.length > 0) await this.execute('git', ['add', '--', ...paths]);
    }

    async commit(message: string): Promise<void> {
        await this.execute('git', ['commit', '-m', message]);
    }

    async push(branch: string, token?: string): Promise<void> {
        await this.executeAuthenticated(['push', 'origin', branch], token);
    }

    private async executeAuthenticated(args: string[], token?: string): Promise<void> {
        if (!token?.trim()) {
            await this.execute('git', args);
            return;
        }
        const environment = buildGitAuthenticationEnvironment(token);
        await this.execute('git', args, {
            // Supply authentication only to this trusted git subprocess. The
            // agent process never receives this value and nothing is persisted
            // in the repository's git configuration or remote URL.
            ...(environment ? { env: environment } : {}),
        });
    }
}
