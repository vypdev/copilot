export type CopyStats = {
    copied: number;
    skipped: number;
};
export declare function copySetupFile(source: string, destination: string, displaySource: string, displayDestination: string): CopyStats;
export declare function copySetupDirectory(sourceDirectory: string, destinationDirectory: string, fileFilter: (fileName: string) => boolean, displayDirectory: string): CopyStats;
