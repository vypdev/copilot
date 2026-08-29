import type { EventualConsistencyDelayPort } from '../../application/ports/eventual_consistency_ports';
export declare class TimerDelayAdapter implements EventualConsistencyDelayPort {
    wait(milliseconds: number): Promise<void>;
}
