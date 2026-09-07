export interface GitCommitPort {
    execute(program: string, args: string[], options?: {
        stdout?: (data: Buffer) => void;
        env?: Record<string, string>;
        /** Execute repository-controlled code with a credential-free, temporary home directory. */
        untrusted?: boolean;
    }): Promise<number>;
    configureAuthor(name: string, email: string): Promise<void>;
    fetch(branch: string, token?: string): Promise<void>;
    stageAll(): Promise<void>;
    stagePaths(paths: string[]): Promise<void>;
    commit(message: string): Promise<void>;
    push(branch: string, token?: string): Promise<void>;
}
