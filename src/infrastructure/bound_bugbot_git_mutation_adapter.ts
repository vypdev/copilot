import type { AuthenticatedUserPort } from '../application/ports/authenticated_user_ports';
import type { BugbotGitMutationPort } from '../application/ports/bugbot_git_ports';
import type { GitCommitPort } from '../application/ports/git_ports';

/** Keeps the route credential at the infrastructure boundary for Bugbot mutations. */
export class BoundBugbotGitMutationAdapter implements BugbotGitMutationPort {
  constructor(
    private readonly git: GitCommitPort,
    private readonly authenticatedUser: AuthenticatedUserPort,
    private readonly token: string,
  ) {}

  execute(...args: Parameters<GitCommitPort['execute']>): Promise<number> {
    return this.git.execute(...args);
  }

  getAuthenticatedUserDetails(): Promise<{ name: string; email: string }> {
    return this.authenticatedUser.getTokenUserDetails(this.token);
  }

  configureAuthor(name: string, email: string): Promise<void> {
    return this.git.configureAuthor(name, email);
  }

  fetch(branch: string): Promise<void> {
    return this.git.fetch(branch, this.token);
  }

  stageAll(): Promise<void> {
    return this.git.stageAll();
  }

  stagePaths(paths: string[]): Promise<void> {
    return this.git.stagePaths(paths);
  }

  commit(message: string): Promise<void> {
    return this.git.commit(message);
  }

  push(branch: string): Promise<void> {
    return this.git.push(branch, this.token);
  }
}
