export interface OpenCodeFileDiff {
    path?: string;
    file?: string;
    [key: string]: unknown;
}
export declare function getSessionDiff(baseUrl: string, sessionId: string): Promise<OpenCodeFileDiff[]>;
