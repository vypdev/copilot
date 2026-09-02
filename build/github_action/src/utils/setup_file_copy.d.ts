export type CopyStats = {
    copied: number;
    skipped: number;
};
export interface CopyOptions {
    overwrite?: boolean;
    backupDirectory?: string;
}
export declare function copySetupFile(source: string, destination: string, displaySource: string, displayDestination: string, options?: CopyOptions): CopyStats;
export declare function copySetupDirectory(sourceDirectory: string, destinationDirectory: string, fileFilter: (fileName: string) => boolean, displayDirectory: string, options?: CopyOptions): CopyStats;
