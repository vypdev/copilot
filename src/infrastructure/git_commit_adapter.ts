import * as exec from '@actions/exec';
import type { GitCommitPort } from '../application/ports/git_ports';

type GitCommandOptions = { stdout?: (data: Buffer) => void };
type GitCommandExecutor = (program: string, args: string[], options?: GitCommandOptions) => Promise<number>;

export class GitCommitAdapter implements GitCommitPort {
    constructor(
        private readonly executeCommand: GitCommandExecutor = (program, args, options) => options
            ? exec.exec(program, args, { listeners: { stdout: options.stdout } })
            : exec.exec(program, args),
    ) {}

    async execute(program: string, args: string[], options?: GitCommandOptions): Promise<number> {
        return options ? this.executeCommand(program, args, options) : this.executeCommand(program, args);
    }

    async configureAuthor(name: string, email: string): Promise<void> {
        await this.execute('git', ['config', 'user.name', name]);
        await this.execute('git', ['config', 'user.email', email]);
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

    async push(branch: string): Promise<void> {
        await this.execute('git', ['push', 'origin', branch]);
    }
}
