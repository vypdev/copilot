import type { DoctorCheckStatus, SetupCredentialCheck, SetupCredentialRequirement, SetupRemoteConfiguration, SetupVariable } from '../domain/setup';
export declare function statusIcon(status: SetupCredentialCheck['status']): string;
export declare function doctorIcon(status: DoctorCheckStatus): string;
export declare function formatTask(task: string): string;
export declare function color(value: string, code: number): string;
export declare function renderBox(content: string, title: string, borderCode?: number): string;
export declare function renderRemoteConfiguration(remote: SetupRemoteConfiguration, variables: readonly SetupVariable[], requirements: readonly SetupCredentialRequirement[]): string;
