import { EventEmitter } from 'node:events';
import { openWebSetupBrowser } from '../web_setup_server';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));

describe('local browser launch fallback', () => {
  test.each([
    ['darwin', 'open', ['http://127.0.0.1:12345/']],
    ['linux', 'xdg-open', ['http://127.0.0.1:12345/']],
    ['win32', 'cmd', ['/c', 'start', '', 'http://127.0.0.1:12345/']],
  ])('uses the %s opener and tolerates failure', (platform, command, args) => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { configurable: true, value: platform });
    const child = new EventEmitter() as EventEmitter & { unref: jest.Mock };
    child.unref = jest.fn();
    mockSpawn.mockReturnValueOnce(child);
    const url = 'http://127.0.0.1:12345/';
    try {
      openWebSetupBrowser(url);
      expect(mockSpawn).toHaveBeenCalledWith(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
      expect(child.unref).toHaveBeenCalledTimes(1);
      expect(() => child.emit('error', new Error('No desktop opener'))).not.toThrow();
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: original });
      mockSpawn.mockClear();
    }
  });
});
