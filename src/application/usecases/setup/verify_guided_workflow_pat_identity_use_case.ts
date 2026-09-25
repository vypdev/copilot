import type { SetupGithubIdentity, SetupGithubIdentityQueryPort } from '../../ports/setup_pat_identity_ports';
import { ApplicationError } from '../../errors/application_error';

/** Binds a guided runtime PAT to the bot account chosen before token entry. */
export class VerifyGuidedWorkflowPatIdentityUseCase {
    constructor(private readonly identities: SetupGithubIdentityQueryPort) {}

    async execute(expected: SetupGithubIdentity, workflowToken: string): Promise<SetupGithubIdentity> {
        const actual = await this.identities.identify(workflowToken);
        if (actual.id !== expected.id) {
            throw new ApplicationError(
                'authorization.credential-invalid',
                `The workflow PAT belongs to @${actual.login}, not the selected bot @${expected.login}. No Secret was written. Delete the unintended PAT in GitHub and create one as @${expected.login}.`,
            );
        }
        return expected;
    }
}
