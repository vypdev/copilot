import type { SupportOperation, SupportState } from './support_context.ts';

export interface SupportCopy {
    readonly statuses: Readonly<Record<SupportState, string>>;
    readonly operations: Readonly<Record<SupportOperation, string>>;
    readonly recoverySteps: readonly [string, string, string];
    readonly updateSteps: readonly [string, string, string];
    readonly help: string; readonly recovery: string; readonly about: string; readonly read: string;
    readonly guides: string; readonly configuration: string; readonly access: string; readonly runtime: string; readonly troubleshooting: string;
    readonly localRoutes: string; readonly privacy: string; readonly connections: string; readonly data: string; readonly welcome: string;
    readonly version: string; readonly packageName: string; readonly manifest: string; readonly pageSource: string;
    readonly unsupported: string; readonly unavailable: string; readonly sourceUnknown: string; readonly identityBoundary: string;
    readonly update: string; readonly history: string; readonly historyBoundary: string; readonly safety: string;
}
