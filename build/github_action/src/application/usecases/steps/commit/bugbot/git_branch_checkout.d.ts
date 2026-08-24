import type { GitCommitPort } from '../../../../ports/git_ports';
/** Infrastructure boundary for checking out a branch without losing workspace changes. */
export declare function checkoutBranch(branch: string, gitCommitPort: GitCommitPort): Promise<boolean>;
