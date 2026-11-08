import { ApplicationError } from './application_error';

/** Host-validated candidate proof rejection; distinct from agent execution and capacity failures. */
export class BugbotVerificationResponseFailure extends ApplicationError {
    readonly reason = 'verification-invalid' as const;
    constructor(message: string) {
        super('agent.failed', message);
    }
}
