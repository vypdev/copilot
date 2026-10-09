import { finishWebSetupSession } from '../setup_outcome_adapter';
import type { WebSetupBridge } from '../web_setup_bridge';
import type { WebSetupServer } from '../web_setup_server';

describe('web setup final outcome fallback', () => {
  it.each([
    [0, 'cancelled'],
    ['0', 'cancelled'],
    [null, 'cancelled'],
    [undefined, 'cancelled'],
    [1, 'blocked'],
    ['1', 'blocked'],
    ['invalid', 'blocked'],
  ] as const)('classifies an absent journey outcome with exit code %s as %s', async (exitCode, expected) => {
    const finish = jest.fn();
    const bridge = { snapshot: () => ({}), finish } as unknown as WebSetupBridge;
    const server = { closed: Promise.resolve() } as WebSetupServer;

    await finishWebSetupSession(bridge, server, exitCode);

    expect(finish).toHaveBeenCalledWith(expected, expect.any(String));
  });

  it('keeps a recorded journey result even when the process exit code differs', async () => {
    const finish = jest.fn();
    const bridge = { snapshot: () => ({ journey: { outcome: 'partial' } }), finish } as unknown as WebSetupBridge;
    const server = { closed: Promise.resolve() } as WebSetupServer;

    await finishWebSetupSession(bridge, server, '0');

    expect(finish).toHaveBeenCalledWith('partial', expect.stringContaining('partial'));
  });
});
