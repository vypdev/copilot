export interface EventualConsistencyDelayPort {
    wait(milliseconds: number): Promise<void>;
}
