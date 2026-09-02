import type { SetupCredentialPromptPort, SetupPromptPort, SetupWorkflowUpdatePromptPort, DoctorOutputPort } from '../application/ports/setup_wizard_ports';
import type { SetupConfiguration, SetupPlan, SetupCredentialCheck, SetupCredentialRequirement, SetupCredentialDecision, SetupCredentialValue, SetupWorkflowComparison } from '../domain/setup';
export interface SetupPromptAdapterOptions {
    interactive?: boolean;
    assumeYes?: boolean;
    credentialValues?: Record<string, string>;
}
export declare class SetupPromptAdapter implements SetupPromptPort, SetupCredentialPromptPort, SetupWorkflowUpdatePromptPort, DoctorOutputPort {
    private readonly interactive;
    private readonly assumeYes;
    private readonly readline;
    private readonly credentialValues;
    constructor(options?: SetupPromptAdapterOptions);
    collect(defaults: SetupConfiguration): Promise<SetupConfiguration>;
    showPlan(plan: SetupPlan): void;
    confirm(plan: SetupPlan): Promise<boolean>;
    requestSetupPat(): Promise<string | undefined>;
    explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void;
    requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision>;
    showCredentialChecks(checks: readonly SetupCredentialCheck[]): void;
    showDoctorChecks(checks: readonly import('../domain/setup').DoctorCheck[]): void;
    confirmWorkflowUpdates(comparisons: readonly SetupWorkflowComparison[], forcedByFlag: boolean): Promise<boolean>;
    close(): void;
    private askText;
    private requestSecretForRequirement;
    private askSecret;
    private askNumber;
    private askBoolean;
    private askChoice;
}
