/** Credential-bound Git authority available only to trusted Bugbot orchestration. */
export interface BugbotGitMutationPort {
  execute(program: string, args: string[], options?: {
    stdout?: (data: Buffer) => void;
    env?: Record<string, string>;
    untrusted?: boolean;
  }): Promise<number>;
  getAuthenticatedUserDetails(): Promise<{ name: string; email: string }>;
  configureAuthor(name: string, email: string): Promise<void>;
  fetch(branch: string): Promise<void>;
  stageAll(): Promise<void>;
  stagePaths(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(branch: string): Promise<void>;
}
