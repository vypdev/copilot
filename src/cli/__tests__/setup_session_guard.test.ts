import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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

  test('fails closed on a verified dead owner until the operator removes its exact lock', () => {
    const oldRecord = JSON.stringify({ pid: 99999999, nonce: 'old-owner', repository: realpathSync(root) });
    writeFileSync(lockPath(), oldRecord);
    expect(() => acquireSetupSessionGuard(root)).toThrow(`remove only that file manually`);
    expect(readFileSync(lockPath(), 'utf8')).toBe(oldRecord);
    unlinkSync(lockPath()); // Simulates explicit operator recovery after verifying no setup is running.
    const release = acquireSetupSessionGuard(root);
    expect(JSON.parse(readFileSync(lockPath(), 'utf8')).pid).toBe(process.pid);
    release();
  });

  test('a replacement lock is never unlinked after a stale-owner probe', () => {
    writeFileSync(lockPath(), JSON.stringify({ pid: 99999999, nonce: 'old-owner', repository: realpathSync(root) }));
    const newRecord = JSON.stringify({ pid: process.pid, nonce: 'new-owner', repository: realpathSync(root) });
    const probe = jest.spyOn(process, 'kill').mockImplementationOnce(() => {
      unlinkSync(lockPath());
      writeFileSync(lockPath(), newRecord); // Another process won the race after our read.
      throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    });
    try {
      expect(() => acquireSetupSessionGuard(root)).toThrow('remove only that file manually');
      expect(readFileSync(lockPath(), 'utf8')).toBe(newRecord);
    } finally { probe.mockRestore(); }
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

  test('does not mistake a failed atomic link for an existing setup session', () => {
    const link = jest.spyOn(require('node:fs'), 'linkSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Filesystem is read-only'), { code: 'EROFS' });
    });
    try {
      expect(() => acquireSetupSessionGuard(root)).toThrow('Filesystem is read-only');
      expect(existsSync(lockPath())).toBe(false);
      expect(readdirSync(tmpdir()).filter(name => name.startsWith(`${basename(lockPath())}.`))).toEqual([]);
    } finally { link.mockRestore(); }
  });

  test('a failed staged write never publishes an empty lock or leaves a staging file', () => {
    const write = jest.spyOn(require('node:fs'), 'writeFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    });
    try {
      expect(() => acquireSetupSessionGuard(root)).toThrow('Disk full');
      expect(existsSync(lockPath())).toBe(false);
      expect(readdirSync(tmpdir()).filter(name => name.startsWith(`${basename(lockPath())}.`))).toEqual([]);
    } finally { write.mockRestore(); }
    const release = acquireSetupSessionGuard(root);
    release();
  });
});
