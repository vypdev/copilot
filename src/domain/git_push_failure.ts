/** Safe facts from the trusted push adapter; never carries raw stderr or credentials. */
export type GitPushDenial = 'workflow-write-required' | 'unclassified';
export class GitPushFailure extends Error {
  constructor(readonly reason: GitPushDenial) {
    super('Git push did not return a successful publication response.');
    this.name = 'GitPushFailure';
    Object.freeze(this);
  }
}
export function admittedGitPushDenial(error: unknown): GitPushDenial {
  return error instanceof GitPushFailure && error.reason === 'workflow-write-required'
    ? 'workflow-write-required' : 'unclassified';
}
