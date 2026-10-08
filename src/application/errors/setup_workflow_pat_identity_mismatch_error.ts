import type { SetupGithubIdentity } from '../ports/setup_pat_identity_ports';
import { ApplicationError } from './application_error';

/** A confirmed account mismatch, before workflow capability checks or Secret writes. */
export class SetupWorkflowPatIdentityMismatchError extends ApplicationError {
    constructor(
        readonly expected: SetupGithubIdentity,
        readonly actual: SetupGithubIdentity,
    ) {
        super('authorization.credential-invalid',
            `The workflow PAT belongs to @${actual.login}, not the selected bot @${expected.login}. No Secret was written. Delete the unintended PAT in GitHub and create one as @${expected.login}.`);
    }
}
