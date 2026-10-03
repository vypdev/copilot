export interface WindowsUserIdentity {
    readonly sid: string;
    readonly localAdministrator: boolean;
}

export function assertWindowsExecutableDacl(sddl: string, userSid: string, localAdministrator: boolean): void;
export function assertWindowsExecutableParentDacl(sddl: string, userSid: string, localAdministrator: boolean): void;
export function parseWindowsExecutableDescriptors(output: string, expectedCount: number): string[];
export function currentWindowsUserIdentity(): WindowsUserIdentity;
export function isLocalWindowsAdministrator(sid: string, accountDomain: string | undefined, computerName: string): boolean;
export function systemTool(name: string): string;
export function verifyWindowsAgentExecutableAcl(path: string): void;
