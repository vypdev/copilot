export interface ChangeSizeThresholdConfiguration {
    readonly lines: number;
    readonly files: number;
    readonly commits: number;
}

export type ChangeSizeThresholds = Readonly<Record<'xxl' | 'xl' | 'l' | 'm' | 's' | 'xs', ChangeSizeThresholdConfiguration>>;
export type ChangeSizeLabels = Readonly<Record<'xxl' | 'xl' | 'l' | 'm' | 's' | 'xs', string>>;

export interface BranchChangeSizePort {
    getSizeCategoryAndReason(owner: string, repository: string, head: string, base: string, sizeThresholds: ChangeSizeThresholds, labels: ChangeSizeLabels, token: string): Promise<{ size: string; githubSize: string; reason: string }>;
}

export interface BoundBranchChangeSizePort {
    getSizeCategoryAndReason(
        head: string,
        base: string,
        sizeThresholds: ChangeSizeThresholds,
        labels: ChangeSizeLabels,
    ): Promise<{ size: string; githubSize: string; reason: string }>;
}
