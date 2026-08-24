import type { GitCommitPort } from '../application/ports/git_ports';
type GitCommandOptions = {
    stdout?: (data: Buffer) => void;
};
type GitCommandExecutor = (program: string, args: string[], options?: GitCommandOptions) => Promise<number>;
export declare class GitCommitAdapter implements GitCommitPort {
    private readonly executeCommand;
    constructor(executeCommand?: GitCommandExecutor);
    execute(program: string, args: string[], options?: GitCommandOptions): Promise<number>;
    configureAuthor(name: string, email: string): Promise<void>;
    stageAll(): Promise<void>;
    stagePaths(paths: string[]): Promise<void>;
    commit(message: string): Promise<void>;
    push(branch: string): Promise<void>;
}
export {};
