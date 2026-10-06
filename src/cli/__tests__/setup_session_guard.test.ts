import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { acquireSetupSessionGuard } from '../setup_session_guard';
import { ApplicationError } from '../../application/errors/application_error';
import { reportSetupFailure } from '../setup_outcome_adapter';
import * as logger from '../../utils/logger';

describe('setup session guard', () => {
  let root: string;
  let canonicalRepository: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'copilot-setup-guard-'));
    execFileSync('git', ['init', '-q', root]);
    canonicalRepository = realpathSync(execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
    mkdirSync(join(root, 'nested'));
  });
  // Git may report a different spelling of the same Windows checkout path.
  // Seed the exact canonical path used by acquireSetupSessionGuard.
  const lockPath = () => join(tmpdir(), `copilot-setup-${createHash('sha256').update(canonicalRepository).digest('hex').slice(0, 32)}.lock`);
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
    const oldRecord = JSON.stringify({ pid: 99999999, nonce: 'old-owner', repository: canonicalRepository });
    writeFileSync(lockPath(), oldRecord);
    expect(() => acquireSetupSessionGuard(root)).toThrow(ApplicationError);
    expect(() => acquireSetupSessionGuard(root)).toThrow(`remove only that file manually`);
    expect(readFileSync(lockPath(), 'utf8')).toBe(oldRecord);
    unlinkSync(lockPath()); // Simulates explicit operator recovery after verifying no setup is running.
    const release = acquireSetupSessionGuard(root);
    expect(JSON.parse(readFileSync(lockPath(), 'utf8')).pid).toBe(process.pid);
    release();
  });

  test('a stale-lock diagnostic survives setup failure reporting without exposing lock contents', () => {
    writeFileSync(lockPath(), JSON.stringify({ pid: 99999999, nonce: 'private-marker', repository: canonicalRepository }));
    let error: unknown;
    try { acquireSetupSessionGuard(root); } catch (failure) { error = failure; }
    const log = jest.spyOn(logger, 'logError').mockImplementation();
    try {
      expect(reportSetupFailure(error, { mutationStarted: false, applyStarted: false, guidedBotIdentity: false })).toBe(1);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ code: 'configuration.invalid',
        message: expect.stringContaining(lockPath()) }));
      expect(log.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining('stopped process (99999999)') });
      expect((log.mock.calls[0][0] as ApplicationError).message).not.toContain('private-marker');
      expect(existsSync(lockPath())).toBe(true);
    } finally { log.mockRestore(); }
  });

  test('a replacement lock is never unlinked after a stale-owner probe', () => {
    writeFileSync(lockPath(), JSON.stringify({ pid: 99999999, nonce: 'old-owner', repository: canonicalRepository }));
    const newRecord = JSON.stringify({ pid: process.pid, nonce: 'new-owner', repository: canonicalRepository });
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
    expect(() => acquireSetupSessionGuard(root)).toThrow(ApplicationError);
    expect(readFileSync(lockPath(), 'utf8')).toBe(content);
  });

  test.each([
    ['SIGINT', 130, false], ['SIGTERM', 143, false], ['SIGINT', 130, true],
  ] as const)('%s exit=%i preserves replacement=%s', async (signal, exitCode, replace) => {
    const script = `
      const ts = require(${JSON.stringify(require.resolve('typescript'))});
      const fs = require('node:fs');
      require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
      }).outputText, filename);
      require(${JSON.stringify(require.resolve('../setup_session_guard'))}).acquireSetupSessionGuard(process.argv[1]);
      process.on('message', signal => process.emit(signal));
      console.log('locked');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['-e', script, root], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout!.once('data', () => resolve());
        child.once('error', reject);
        child.once('close', () => reject(new Error('Child exited before acquiring guard')));
      });
      const replacement = JSON.stringify({ pid: process.pid, nonce: 'replacement', repository: canonicalRepository });
      if (replace) writeFileSync(lockPath(), replacement);
      // Windows child.kill forcibly terminates without invoking Node signal handlers.
      // Exercise the cooperative console-signal path there; POSIX uses real signals.
      if (process.platform === 'win32') child.send(signal);
      else child.kill(signal);
      expect(await exited).toBe(exitCode);
      if (replace) expect(readFileSync(lockPath(), 'utf8')).toBe(replacement);
      else expect(existsSync(lockPath())).toBe(false);
    } finally {
      child.kill('SIGKILL');
      await exited;
    }
  });

  test.each([['SIGINT', 130], ['SIGTERM', 143]] as const)('installs %s handler only while the session owns its lock', (signal, code) => {
    const originalListeners = process.listeners(signal);
    const release = acquireSetupSessionGuard(root);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      process.emit(signal);
      expect(exit).toHaveBeenCalledWith(code);
      release();
      expect(process.listeners(signal)).toEqual(originalListeners);
      expect(existsSync(lockPath())).toBe(false);
    } finally { release(); exit.mockRestore(); }
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
