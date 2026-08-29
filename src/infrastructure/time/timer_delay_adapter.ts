import type { EventualConsistencyDelayPort } from '../../application/ports/eventual_consistency_ports';

export class TimerDelayAdapter implements EventualConsistencyDelayPort {
  async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}
