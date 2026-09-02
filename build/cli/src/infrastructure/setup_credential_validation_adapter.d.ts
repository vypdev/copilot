import type { SetupCredentialCheck, SetupCredentialRequirement } from '../domain/setup';
import type { SetupCredentialValidationPort } from '../application/ports/setup_wizard_ports';
export interface SetupCredentialValidationOptions {
    fetcher?: typeof fetch;
    timeoutMs?: number;
}
/**
 * Performs bounded, metadata-only credential checks. Provider responses are
 * intentionally never returned or logged because they can contain account data.
 */
export declare class SetupCredentialValidationAdapter implements SetupCredentialValidationPort {
    private readonly fetcher;
    private readonly timeoutMs;
    constructor(options?: SetupCredentialValidationOptions);
    validateSetupPat(owner: string, repository: string, token: string): Promise<SetupCredentialCheck>;
    validateCredential(requirement: SetupCredentialRequirement, value: string): Promise<SetupCredentialCheck>;
    private requestJson;
}
