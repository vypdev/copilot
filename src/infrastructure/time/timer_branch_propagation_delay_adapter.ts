import type { BranchPropagationDelayPort } from "../../application/ports/branch_preparation_ports";

export class TimerBranchPropagationDelayAdapter implements BranchPropagationDelayPort {
  constructor(private readonly delayMilliseconds = 10_000) {}

  waitForLinkedBranch = async (): Promise<void> => {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, this.delayMilliseconds),
    );
  };
}
