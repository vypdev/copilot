const mockReadlineHandlers = new Map<string, (...args: unknown[]) => void>();
const mockQuestion = jest.fn();
const mockClose = jest.fn();
const mockReadline = {
  question: mockQuestion,
  once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    mockReadlineHandlers.set(event, handler);
  }),
  off: jest.fn((event: string) => {
    mockReadlineHandlers.delete(event);
  }),
  close: mockClose,
};
const mockInputHandlers = new Map<string, (...args: unknown[]) => void>();
const mockStdin = {
  isTTY: true,
  setRawMode: jest.fn(),
  resume: jest.fn(),
  pause: jest.fn(),
  on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    mockInputHandlers.set(event, handler);
  }),
  once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    mockInputHandlers.set(event, handler);
  }),
  off: jest.fn((event: string) => {
    mockInputHandlers.delete(event);
  }),
};
const mockStdout = {
  isTTY: true,
  columns: 80,
  write: jest.fn(),
};

jest.mock('node:readline/promises', () => ({
  createInterface: jest.fn(() => mockReadline),
}));
jest.mock('node:process', () => ({
  stdin: mockStdin,
  stdout: mockStdout,
}));

import {
  createInteractiveTerminalDriver,
  interactiveTerminalAvailable,
  NodeTerminalDriver,
} from '../setup_terminal_driver';

describe('NodeTerminalDriver', () => {
  const worker = process.env.JEST_WORKER_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadlineHandlers.clear();
    mockInputHandlers.clear();
    mockStdin.isTTY = true;
    mockStdout.isTTY = true;
    mockStdin.setRawMode = jest.fn();
    delete process.env.JEST_WORKER_ID;
  });

  afterAll(() => {
    if (worker === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = worker;
  });

  it('creates a driver only for an interactive terminal', () => {
    expect(interactiveTerminalAvailable()).toBe(true);
    expect(createInteractiveTerminalDriver()).toBeInstanceOf(NodeTerminalDriver);
    mockStdin.isTTY = false;
    expect(interactiveTerminalAvailable()).toBe(false);
    expect(createInteractiveTerminalDriver()).toBeUndefined();
    expect(() => new NodeTerminalDriver()).toThrow('interactive terminal');
  });

  it('returns text input and closes idempotently', async () => {
    mockQuestion.mockResolvedValueOnce('answer');
    const driver = new NodeTerminalDriver();
    await expect(driver.readText('Question: ')).resolves.toEqual({ kind: 'value', value: 'answer' });
    expect(driver.isInteractive()).toBe(true);
    driver.close();
    driver.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(driver.isInteractive()).toBe(false);
    await expect(driver.readText('Question: ')).resolves.toEqual({ kind: 'end-of-input' });
    await expect(driver.readSecret('Secret')).resolves.toEqual({ kind: 'end-of-input' });
  });

  it.each([
    ['SIGINT', 'cancel'],
    ['close', 'end-of-input'],
  ] as const)('maps readline %s to %s', async (event, kind) => {
    mockQuestion.mockImplementationOnce((_prompt: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }));
    const driver = new NodeTerminalDriver();
    const pending = driver.readText('Question: ');
    mockReadlineHandlers.get(event)?.();
    await expect(pending).resolves.toEqual({ kind });
  });

  it('propagates an unexpected readline failure', async () => {
    mockQuestion.mockRejectedValueOnce(new Error('terminal failure'));
    await expect(new NodeTerminalDriver().readText('Question: ')).rejects.toThrow('terminal failure');
  });

  it('reads hidden input, handles backspace, and restores terminal mode', async () => {
    const driver = new NodeTerminalDriver();
    const pending = driver.readSecret('Secret');
    mockInputHandlers.get('data')?.(Buffer.from('abc\u007fd\n'));
    await expect(pending).resolves.toEqual({ kind: 'value', value: 'abd' });
    expect(mockStdin.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(mockStdout.write).toHaveBeenCalledWith('\n');
  });

  it.each([
    ['data', '\u0003', 'cancel'],
    ['data', '\u0004', 'end-of-input'],
    ['end', '', 'end-of-input'],
  ] as const)('maps secret %s event to %s', async (event, value, kind) => {
    const pending = new NodeTerminalDriver().readSecret('Secret');
    mockInputHandlers.get(event)?.(value);
    await expect(pending).resolves.toEqual({ kind });
  });

  it('uses text input when raw mode is unavailable', async () => {
    mockStdin.setRawMode = undefined as unknown as jest.Mock;
    mockQuestion.mockResolvedValueOnce('fallback-secret');
    await expect(new NodeTerminalDriver().readSecret('Secret')).resolves.toEqual({
      kind: 'value',
      value: 'fallback-secret',
    });
  });
});
