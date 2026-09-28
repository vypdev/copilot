import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireSetupSessionGuard } from '../setup_session_guard';

describe('setup session guard', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'copilot-setup-guard-'));
    execFileSync('git', ['init', '-q', root]);
    mkdirSync(join(root, 'nested'));
  });
  const lockPath = () => join(tmpdir(), `copilot-setup-${createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 32)}.lock`);
  afterEach(() => {
    const lock = lockPath();
    if (existsSync(lock)) unlinkSync(lock);
    rmSync(root, { recursive: true, force: true });
  });

  test('serializes setup across directories of the same checkout and releases only its own lock', () => {
    const release = acquireSetupSessionGuard(root);
    expect(() => acquireSetupSessionGuard(join(root, 'nested'))).toThrow('Another setup process');
    release();
    const releaseNext = acquireSetupSessionGuard(join(root, 'nested'));
    release(); // An old release callback must not remove a new owner's lock.
    expect(() => acquireSetupSessionGuard(root)).toThrow('Another setup process');
    releaseNext();
    const releaseThird = acquireSetupSessionGuard(root);
    releaseThird();
  });

  test('recovers a verified dead owner without reusing its nonce', () => {
    writeFileSync(lockPath(), JSON.stringify({ pid: 99999999, nonce: 'old-owner', repository: realpathSync(root) }));
    const release = acquireSetupSessionGuard(root);
    const current = JSON.parse(readFileSync(lockPath(), 'utf8')) as { pid: number; nonce: string };
    expect(current.pid).toBe(process.pid);
    expect(current.nonce).not.toBe('old-owner');
    release();
    expect(existsSync(lockPath())).toBe(false);
  });

  test.each([
    ['not-json'],
    [JSON.stringify({ pid: -1, nonce: 'bad', repository: 'wrong' })],
  ])('fails closed for an unverifiable lock %s', content => {
    writeFileSync(lockPath(), content);
    expect(() => acquireSetupSessionGuard(root)).toThrow('lock');
    expect(readFileSync(lockPath(), 'utf8')).toBe(content);
  });

  test('propagates a filesystem error instead of treating it as a competing session', () => {
    const open = jest.spyOn(require('node:fs'), 'openSync').mockImplementationOnce(() => { throw Object.assign(new Error('Permission denied'), { code: 'EACCES' }); });
    try {
      expect(() => acquireSetupSessionGuard(root)).toThrow('Permission denied');
    } finally {
      open.mockRestore();
    }
  });
});
