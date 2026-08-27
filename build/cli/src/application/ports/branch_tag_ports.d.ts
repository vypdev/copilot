export interface LatestTagQueryPort {
    getLatestTag(): Promise<string | undefined>;
}
